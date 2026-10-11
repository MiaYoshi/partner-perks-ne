import dayjs from 'dayjs'
import { runFromCli } from './scheduler/cli.js'
import { getAuthByPassports, grantCouponsByAuths } from './index.js'

// 示例函数
async function task() {
  console.log('定时函数开始执行！')
  await grantCouponsByAuths()
  console.log('定时函数执行完毕！\n=================================>')
}

// npx tsx run.ts；也可通过第一个命令行参数覆盖目标时间。
await runFromCli(task, {
  // 修改为需要执行的未来时间
  // targetTime: dayjs().set('hour', 23).set('minute', 59).set('second', 59).set('millisecond', 900),
  prepare: async () => {
    console.log('=================================>\n准备函数开始执行')
    await getAuthByPassports()
    console.log('准备函数执行完毕\n=================================>')
  },
  prepareAheadMs: 10 * 1000,
})
