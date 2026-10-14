import dayjs from 'dayjs'
import { scheduleAt } from '../auto.js'
import type { ScheduleOptions } from '../auto.js'
import { printError, printScheduleResult, printTargetTime } from './output.js'
import type { TimeInput } from './time.js'

export type RunCliOptions = ScheduleOptions & {
  /** 未传入命令行时间参数时使用的执行时间。 */
  targetTime?: TimeInput
}

/**
 * 执行时间依次取首个命令行参数、options.targetTime、默认 5 秒后。
 * 统一处理执行结果输出、Ctrl+C 取消、错误退出及事件监听清理。
 */
export async function runFromCli<T>(
  task: () => T | Promise<T>,
  options: RunCliOptions = {},
): Promise<void> {
  const controller = new AbortController()
  const onInterrupt = () => controller.abort(new Error('用户取消了定时任务'))
  process.once('SIGINT', onInterrupt)

  try {
    const { targetTime: configuredTime, ...scheduleOptions } = options
    const targetTime = process.argv[2] ?? configuredTime ?? dayjs().add(5, 'second')
    printTargetTime(targetTime)

    // 同时响应调用方的取消信号和命令行中断。
    const signal = scheduleOptions.signal
      ? AbortSignal.any([scheduleOptions.signal, controller.signal])
      : controller.signal
    const result = await scheduleAt(targetTime, task, { ...scheduleOptions, signal })
    printScheduleResult(result)
  } catch (error) {
    printError(error)
    process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', onInterrupt)
  }
}
