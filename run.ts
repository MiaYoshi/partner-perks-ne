import dayjs, { type Dayjs } from 'dayjs'
import { getAuthByPassports, getSuperCoupons, grantCouponsByAuths, maskSensitive } from '@/api'
import { runFromCli } from '@/scheduler/cli'
import { parseArgs } from 'node:util'

let authList: any[] = []
let couponList: any[] = []
let filterCouponList: any[] = []

// CouponTypeList: ["PHONE_REWARD", "CODE", "DIRECT_LINK"]
const couponTypeList = ['PHONE_REWARD']

// 示例函数
async function prepareTask() {
  console.log('=================================>\n准备函数开始执行')
  authList = await getAuthByPassports()
  console.log('已获取到 authList, 数组长度为', authList?.length)
  authList?.length &&
    authList?.map(({ xsrfToken, jSessionId, glUid }, index) => {
      console.log(
        `Passport ${index + 1}==>xsrfToken: ${maskSensitive(xsrfToken)}, jSessionId: ${maskSensitive(jSessionId)}, glUid: ${maskSensitive(glUid)}`,
      )
    })
  couponList = authList?.length > 0 ? await getSuperCoupons(authList?.[0]) : []
  filterCouponList = couponList?.filter((c: any) => couponTypeList.includes(c?.couponType)) || []
  console.log('已获取到 couponList, 数组长度为', couponList?.length, ', 过滤后长度为', filterCouponList?.length)
  console.log('准备函数执行完毕\n=================================>')
}

async function task() {
  console.log('定时函数开始执行！')
  await grantCouponsByAuths(authList, filterCouponList)
  console.log('定时函数执行完毕！\n=================================>')
}

/**
 * 解析命令行 -t / --time 参数并生成目标 dayjs 对象
 *
 * 支持格式：
 * - "HH:mm"
 * - "HH:mm:ss"
 * - "HH:mm:ss.SSS"
 * 不传参数时默认当天 24:00:00.000（即明日零点）
 */
function getTargetTimeFromCli(defTime: Dayjs): Dayjs {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      time: { type: 'string', short: 't' },
    },
    strict: false,
  })

  let target = dayjs(defTime)

  if (typeof values.time === 'string') {
    const [h = '0', m = '0', s = '0', ms = '0'] = values.time.split(/[:.]/)
    target = dayjs()
      .startOf('day')
      .set('hour', Number(h))
      .set('minute', Number(m))
      .set('second', Number(s))
      .set('millisecond', Number(ms))
  }

  // 跨天保护：如果设定的时间已经过去，自动顺延到明天该时刻
  if (target.isBefore(dayjs())) {
    target = target.add(1, 'day')
  }

  return target
}

// npx tsx run.ts；也可通过第一个命令行参数覆盖目标时间。
async function main() {
  await runFromCli(task, {
    // 修改为需要执行的未来时间
    targetTime: getTargetTimeFromCli(dayjs().set('hour', 24).set('minute', 0).set('second', 0).set('millisecond', 0)),
    prepare: prepareTask,
    prepareAheadMs: 60 * 1000,
  })
}

main()
