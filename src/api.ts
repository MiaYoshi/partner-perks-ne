import crypto from 'crypto'

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

export interface CookieOptions {
  /** 是否过滤掉已过期的 Cookie（例如 Max-Age=0 或 Expires 为过去时间），默认为 true */
  filterExpired?: boolean
}

/**
 * 解析 Set-Cookie 字符串数组为键值对对象
 */
function parseSetCookies(
  setCookieHeaders: string[],
  options: CookieOptions = { filterExpired: true },
): Record<string, string> {
  const cookieMap: Record<string, string> = {}

  for (const header of setCookieHeaders) {
    if (!header || typeof header !== 'string') continue

    // 按分号切分属性段
    const parts = header.split(';').map((p) => p.trim())
    const [mainPair, ...attributes] = parts

    // 判断 mainPair 是否存在
    if (!mainPair) continue

    // 解析主键值对（第一个分号前的内容）
    const equalIndex = mainPair.indexOf('=')
    if (equalIndex === -1) continue

    const key = mainPair.slice(0, equalIndex).trim()
    let value = mainPair.slice(equalIndex + 1).trim()

    // 去除双引号包裹（如 SESSION=""）
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }

    if (options.filterExpired) {
      const isExpired = attributes.some((attr) => {
        const lower = attr.toLowerCase()
        if (lower === 'max-age=0') return true

        if (lower.startsWith('expires=')) {
          const expiresDate = new Date(attr.slice(8))
          return !isNaN(expiresDate.getTime()) && expiresDate.getTime() <= Date.now()
        }
        return false
      })

      if (isExpired || value === '') {
        delete cookieMap[key]
        continue
      }
    }

    cookieMap[key] = value
  }

  return cookieMap
}

/**
 * 敏感信息脱敏：固定输出 10 位字符（头 1 位 + 8 个 * + 尾 1 位）
 * 空值或空字符串直接返回空字符串
 */
function maskSensitive(val?: string | null): string {
  if (!val) return ''

  const head = val[0]
  const tail = val[val.length - 1]

  return `${head}${'*'.repeat(8)}${tail}`
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
async function grantAllCoupons(auth: AuthType | undefined, couponList: any[]) {
  return Promise.allSettled(
    couponList?.map(async (coupon) => {
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
  const cookie = parseSetCookies(r.headers.getSetCookie())
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
  parseSetCookies,
  maskSensitive,
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
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import JSON5 from 'json5'

export async function getAuthByPassports() {
  try {
    // 优先读取 passport.jsonc，不存在则回退读取 passport.json
    const rootDir = process.cwd()
    console.log('当前目录：', rootDir)
    let filePath = resolve(rootDir, 'passport.jsonc')
    if (!existsSync(filePath)) {
      filePath = resolve(rootDir, 'passport.json')
    }
    const jsonStr = readFileSync(filePath, 'utf-8')
    const passportList: any[] = JSON5.parse(jsonStr)
    const resp = await Promise.allSettled(
      passportList.map((psport) => {
        return getAuth(psport)
      }),
    )
    const authList = resp?.map((r: any) => r?.value)
    return authList
  } catch (e: any) {
    console.error('读取 passport 配置失败:', e.message)
    console.log('请检查当前目录passport.jsonc是否存在或格式是否正确')
  }
  return []
}

export async function grantCouponsByAuths(authList: any[], couponList: any[]) {
  const reset = '\x1b[0m'
  const color = '\x1b[34m'

  const logs: any[] = []
  return Promise.allSettled(
    authList.map((auth, index) => {
      return grantAllCoupons(auth, couponList).then((couponRespList) => {
        const success = couponRespList?.filter((c: any) => c?.value?.code === 200)
        const fail = couponRespList?.filter((c: any) => c?.value?.code !== 200)
        logs.push({
          index,
          success,
          fail,
          raw: couponRespList,
          text: `${color}Passport ${index + 1}==>\ntotal: ${couponRespList?.length}, success: ${success.length}, fail: ${fail.length}${reset}`,
        })
      })
    }),
  ).then(() => {
    logs.sort((a, b) => a?.index - b?.index)
    logs.map(({ raw, text }) => {
      console.log(text)
      raw?.map((e: any) => {
        const { code, coupon = {}, result: _result, ...extra } = e?.value || {}
        const obj = { code, name: `${coupon?.brandName}-${coupon?.couponName}`, ...extra }
        console.log(obj)
      })
    })
  })
}
