import dayjs from 'dayjs'
import { getAuthByPassports, getSuperCoupons, grantCouponsByAuths } from './src/api.js'
import { runFromCli } from './src/scheduler/cli.js'

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

// npx tsx run.ts；也可通过第一个命令行参数覆盖目标时间。
await runFromCli(task, {
  // 修改为需要执行的未来时间
  targetTime: dayjs().set('hour', 23).set('minute', 59).set('second', 59).set('millisecond', 900),
  prepare: prepareTask,
  prepareAheadMs: 60 * 1000,
})
