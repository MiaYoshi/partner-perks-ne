import type { ScheduleResult } from '@/auto'
import { formatLocalTime } from './time'
import type { TimeInput } from './time'

export function printTargetTime(targetTime: TimeInput) {
  console.log('目标时间：', formatLocalTime(targetTime))
}

export function printScheduleResult<T>(result: ScheduleResult<T>) {
  console.log('函数返回值：', result.value)
  console.log('计划触发：', formatLocalTime(result.scheduledAt))
  console.log('实际开始：', formatLocalTime(result.startedAt))
  console.log(`触发偏差：+${result.deviationMs.toFixed(3)}ms`)
}

export function printError(error: unknown) {
  console.error(error instanceof Error ? error.message : error)
}
