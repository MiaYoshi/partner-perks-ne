import crypto from 'crypto'
import { parseCookie } from 'cookie'

export const GRANT_URL = 'https://inf.ds.163.com/v1/web/exp-vip/external/super-coupon/grant'
export const SUPER_COUPON_URL = 'https://inf.ds.163.com/v1/web/exp-vip/external/super-coupon/info'

type AuthType = {
  xsrfToken: string
  jSessionId: string
  glUid: string
}

type CouponInfoType = {
  brandId: string
  brandName?: string
  couponId: string
  couponName?: string
  couponType?: string
}

function getSHA1(data: any) {
  return crypto
    .createHash('sha1')
    .update(data, 'utf8') // 如果 data 是 Buffer，不需要指定编码
    .digest('hex')
}
function customFetch(
  auth: AuthType | undefined,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
) {
  if (!auth) {
    return Promise.reject()
  }
  const { xsrfToken, jSessionId, glUid } = auth
  const customHeaders: Record<string, string> = {
    Cookie: `GL-XSRF-TOKEN=${xsrfToken}; JSESSIONID=${jSessionId}`,
    'Content-Type': 'application/json',
    'Gl-X-Xsrf-Token': xsrfToken,
    'Gl-Uid': glUid,
  }
  if (init?.method === 'POST' || init?.method === 'post') {
    const glChecksum = getSHA1(''.concat(String(init?.body || '')).concat(xsrfToken))
    customHeaders['Gl-Checksum'] = glChecksum
  }
  return fetch(input, {
    ...init,
    headers: {
      ...customHeaders,
      ...init?.headers,
    },
  })
}

function querySuperCoupons(auth: AuthType | undefined) {
  return customFetch(auth, SUPER_COUPON_URL, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

function formatSuperCouponsResp(resp: any) {
  const brands = resp?.result?.brands || []
  return [].concat(
    ...(brands?.map((brand: any) => {
      const { brandId, brandName, superCoupons } = brand
      return (
        superCoupons?.map((coupon: any) => {
          const { couponId, couponName, couponType } = coupon
          return {
            brandId,
            brandName,
            couponId,
            couponName,
            couponType,
          }
        }) || []
      )
    }) || []),
  )
}

async function getSuperCoupons(auth: AuthType | undefined) {
  try {
    const res = await querySuperCoupons(auth)
    const r = await res?.json?.()
    return formatSuperCouponsResp(r)
  } catch {
    return []
  }
}

function grantCoupon(auth: AuthType | undefined, couponInfo: CouponInfoType | undefined) {
  if (!couponInfo) {
    return Promise.reject()
  }
  const { brandId, couponId: superCouponId } = couponInfo
  const payload = { brandId, superCouponId, phoneBizType: 'VIP' }
  return customFetch(auth, GRANT_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * CouponTypeList: ["PHONE_REWARD", "CODE", "DIRECT_LINK"]
 */
async function grantAllCoupons(auth: AuthType | undefined, couponTypeList: string[] = ['PHONE_REWARD', 'CODE']) {
  const coupons = await getSuperCoupons(auth)
  const availGrantCoupons = coupons?.filter((c: any) => couponTypeList.includes(c?.couponType)) || []
  return Promise.allSettled(
    availGrantCoupons?.map(async (coupon) => {
      const res = await grantCoupon(auth, coupon)
      const resp = await res?.json?.()
      return Object.assign({}, resp, { coupon })
    }),
  )
}

async function login(ntesYdPassport: string | undefined) {
  if (!ntesYdPassport) {
    return Promise.reject()
  }
  const res = await fetch('https://inf.ds.163.com/v1/web/base/login', {
    method: 'POST',
    headers: {
      Cookie: `NTES_YD_PASSPORT=${ntesYdPassport}`,
    },
  })
  return {
    headers: res.headers,
    data: await res.json(),
  }
}

async function getAuth(ntesYdPassport: string | undefined): Promise<AuthType> {
  if (!ntesYdPassport) {
    return Promise.reject()
  }
  const r = await login(ntesYdPassport)
  const cookie = parseCookie(r.headers.getSetCookie().join(';'))
  return {
    xsrfToken: cookie?.['GL-XSRF-TOKEN'] || '',
    jSessionId: cookie?.['JSESSIONID'] || '',
    glUid: cookie?.['GOD_UUID'] || '',
  }
}

function formatTime(date: Date) {
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
  return `${date.toLocaleString('zh-CN', { hour12: false })}.${milliseconds}`
}

export {
  customFetch,
  grantCoupon,
  querySuperCoupons,
  formatSuperCouponsResp,
  getSuperCoupons,
  grantAllCoupons,
  getSHA1,
  login,
  getAuth,
  formatTime,
}

export type { AuthType, CouponInfoType }

// 适用于 https://vip.ds.163.com/partner-perks
// 实际调用使用getAuthByPassports和grantCouponsByAuths，
// 提前几分钟调用getAuthByPassports，然后0点或者提前百毫秒调用grantCouponsByAuths
// 需要提前创建一个passport.jsonc，
// 里面是json数组放网站的Cookie["NTES_YD_PASSPORT"]的内容，具体怎么拿不教，自己搜索
// Cookie有过期时间，请注意 一个手机号一个，例如:
// [
//   "***",
//   "***"
// ]
//
// 主程序如下:
//
// import { readFileSync, writeFileSync } from 'fs'
// import { resolve } from 'path'
// import { parse } from 'jsonc-parser'

// async function getAuthByPassports() {
//   const jsonStr = readFileSync(resolve(import.meta.dirname, './passport.jsonc'), 'utf-8')
//   const passportList: any[] = parse(jsonStr)
//   const resp = await Promise.allSettled(
//     passportList.map((psport) => {
//       return getAuth(psport)
//     }),
//   )
//   const authList = resp?.map((r: any) => r?.value)
//   const writeFileResp = writeFileSync(
//     resolve(import.meta.dirname, './auth.json'),
//     JSON.stringify(authList, null, 2),
//     'utf-8',
//   )
//   console.log(writeFileResp)
// }

// async function grantCouponsByAuths() {
//   const logs: any[] = []
//   const jsonStr = readFileSync(resolve(import.meta.dirname, './auth.json'), 'utf-8')
//   const authList: any[] = JSON.parse(jsonStr)
//   Promise.allSettled(
//     authList.map((auth, index) => {
//       // CouponTypeList: ["PHONE_REWARD", "CODE", "DIRECT_LINK"]
//       return grantAllCoupons(auth, ['PHONE_REWARD']).then((couponRespList) => {
//         const success = couponRespList?.filter((c: any) => c?.value?.code === 200)
//         const fail = couponRespList?.filter((c: any) => c?.value?.code !== 200)
//         logs.push({
//           index,
//           success,
//           fail,
//           raw: couponRespList,
//           text: `<=====Passport ${index + 1}=====>\ntotal: ${couponRespList?.length}, success: ${success.length}, fail: ${fail.length}`,
//         })
//       })
//     }),
//   ).then(() => {
//     logs.sort((a, b) => a?.index - b?.index)
//     logs.map(({ raw, text }) => {
//       console.log(text)
//       raw?.map((e: any) => {
//         const { code, coupon = {}, result: _result, ...extra } = e?.value || {}
//         const obj = { code, name: `${coupon?.brandName}-${coupon?.couponName}`, ...extra }
//         console.log(obj)
//       })
//     })
//   })
// }

// 请自行添加定时运行逻辑
// getAuthByPassports()
// grantCouponsByAuths()