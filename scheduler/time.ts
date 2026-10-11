import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

export type TimeInput = Dayjs | Date | string | number

/** 校验时间输入并转换为毫秒时间戳。 */
export function toTimestamp(time: TimeInput): number {
  const parsed = dayjs(time)
  if (time === undefined || !parsed.isValid()) {
    throw new RangeError('时间无效，请使用 Day.js 对象、Date、毫秒时间戳或带时区的 ISO 日期字符串')
  }
  // 数字时间戳保留小数部分，用于毫秒以内的时间补偿。
  return typeof time === 'number' ? time : parsed.valueOf()
}

/** 按运行机器的当地时区显示时间，保留毫秒和时区偏移。 */
export function formatLocalTime(time: TimeInput): string {
  return dayjs(toTimestamp(time)).format('YYYY-MM-DD HH:mm:ss.SSS')
}
