import { toTimestamp } from './scheduler/time.js'
import type { TimeInput } from './scheduler/time.js'

export type ScheduleOptions = {
  /** 提前执行的准备工作，例如读取配置或初始化资源。 */
  prepare?: () => void | Promise<void>
  /** 准备工作提前量，默认 5000ms；启动时不足此时间则立即准备。 */
  prepareAheadMs?: number
  /** 目标时钟时间 - 本机时间，默认 0；正数表示目标时钟更快。 */
  clockOffsetMs?: number
  /** 相对目标时间提前触发的毫秒数，默认 0。 */
  advanceMs?: number
  /** 最后忙等的时间，默认 20ms，范围 0～50ms；这期间会占用主线程。 */
  spinMs?: number
  /** 最大允许迟到时间，默认 100ms，超出后报错且不调用任务。 */
  maxLatenessMs?: number
  /** 取消等待；已经开始的准备工作/任务需自行处理取消。 */
  signal?: AbortSignal
}

export type ScheduleResult<T> = {
  value: T
  /** 计划触发时间戳，已扣除 advanceMs，使用目标时钟的时间。 */
  scheduledAt: number
  /** 根据单调时钟估算的实际开始时间戳，已加上 clockOffsetMs。 */
  startedAt: number
  /** 实际开始 - 计划触发，单位 ms；不包含任务执行耗时。 */
  deviationMs: number
}

function checkRange(name: string, value: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new RangeError(`${name} 必须是 0～${max} 之间的有限数值`)
  }
}

/** 等待期间反复校准墙上时钟，最后一小段固定为单调时钟，避免累计计时漂移。 */
function runAt<T>(
  localTargetMs: number,
  task: () => T | Promise<T>,
  spinMs: number,
  maxLatenessMs: number,
  signal: AbortSignal | undefined,
): Promise<ScheduleResult<T>> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let waiting = true

    function cleanup() {
      waiting = false
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    function onAbort() {
      if (!waiting) return
      cleanup()
      reject(signal?.reason ?? new Error('定时任务已取消'))
    }

    function tick() {
      if (!waiting) return
      try {
        signal?.throwIfAborted()
        // 先取墙上时钟，再取单调时钟，避免采样顺序导致提前执行。
        const wallNow = Date.now()
        const monoNow = process.hrtime.bigint()
        const remainingMs = localTargetMs - wallNow

        if (remainingMs > spinMs) {
          // 长等待最多睡 1 秒；临近目标时预留 5ms 唤醒余量。
          // 同时避免 setTimeout 超过 2^31-1ms 时溢出而立即执行。
          const delay = Math.min(1000, Math.max(1, remainingMs - spinMs - 5))
          timer = setTimeout(tick, delay)
          return
        }

        const deadlineNs = monoNow + BigInt(Math.round(remainingMs * 1_000_000))
        let startedNs = process.hrtime.bigint()
        // 仅最后 spinMs 内忙等；不要在这里记录日志、分配对象或执行 I/O。
        while (startedNs < deadlineNs) startedNs = process.hrtime.bigint()

        const wallStartedAt = Date.now()
        // 忙等期间若系统时间回拨，重新等待，避免按旧时钟提前触发。
        if (wallStartedAt < localTargetMs) {
          timer = setTimeout(tick, 1)
          return
        }
        // 同时检查墙上时钟，涵盖两次时钟采样之间被系统暂停的情况。
        const deviationMs = Math.max(
          wallStartedAt - localTargetMs,
          Number(startedNs - deadlineNs) / 1_000_000,
        )
        if (deviationMs > maxLatenessMs) {
          throw new Error(
            `已迟到 ${deviationMs.toFixed(3)}ms，超过允许的 ${maxLatenessMs}ms，任务未执行`,
          )
        }

        waiting = false
        // 直接调用，不通过另一个定时器或 await 将任务再次排队。
        const value = task()
        cleanup()
        Promise.resolve(value).then(
          (value) => resolve({
            value,
            scheduledAt: localTargetMs,
            startedAt: localTargetMs + deviationMs,
            deviationMs,
          }),
          reject,
        )
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    tick()
  })
}

/**
 * 在指定时间执行一次同步或异步函数，返回任务结果及触发时间信息。
 * 目标时间支持 Day.js 对象、Date、毫秒时间戳或 ISO 8601 字符串。
 * 日期字符串建议显式携带时区。
 * 可通过 prepare 提前完成初始化；迟到超过 maxLatenessMs 时拒绝执行并返回错误。
 * 触发偏差仅衡量函数开始调用的时间，不包含函数执行耗时。
 */
export async function scheduleAt<T>(
  targetTime: TimeInput,
  task: () => T | Promise<T>,
  options: ScheduleOptions = {},
): Promise<ScheduleResult<T>> {
  const {
    prepare,
    prepareAheadMs = 5000,
    clockOffsetMs = 0,
    advanceMs = 0,
    spinMs = 20,
    maxLatenessMs = 100,
    signal,
  } = options
  const targetMs = toTimestamp(targetTime)
  if (typeof task !== 'function') throw new TypeError('task 必须是函数')
  if (!Number.isFinite(clockOffsetMs)) throw new RangeError('clockOffsetMs 必须是有限数值')
  checkRange('prepareAheadMs', prepareAheadMs)
  checkRange('advanceMs', advanceMs)
  checkRange('spinMs', spinMs, 50)
  checkRange('maxLatenessMs', maxLatenessMs)
  signal?.throwIfAborted()

  const scheduledAt = targetMs - advanceMs
  const localTargetMs = toTimestamp(scheduledAt - clockOffsetMs)
  if (localTargetMs <= Date.now()) {
    throw new RangeError('换算后的执行时间必须是有效的未来时间，请检查目标时间和时间补偿')
  }

  if (prepare) {
    // 准备工作无需忙等；如果已经进入准备窗口，则立即执行。
    await runAt(localTargetMs - prepareAheadMs, prepare, 0, Infinity, signal)
  }

  const result = await runAt(localTargetMs, task, spinMs, maxLatenessMs, signal)
  return { ...result, scheduledAt, startedAt: result.startedAt + clockOffsetMs }
}
