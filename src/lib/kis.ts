import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.KIS_BASE_URL ?? 'https://openapivts.koreainvestment.com:29443'
const APP_KEY = process.env.KIS_APP_KEY ?? ''
const APP_SECRET = process.env.KIS_APP_SECRET ?? ''

const IS_MOCK = BASE_URL.includes('vts')

type TokenCache = {
  token: string
  expiresAt: number
}

// ── Upstash Redis 캐시 (프로덕션) ───────────────────────────────────────
const HAS_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

async function redisGet(): Promise<TokenCache | null> {
  if (!HAS_REDIS) return null
  try {
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    const cache = await redis.get<TokenCache>('kis-token')
    if (cache && Date.now() < cache.expiresAt - 60_000) return cache
    return null
  } catch {
    return null
  }
}

async function redisSet(cache: TokenCache): Promise<void> {
  if (!HAS_REDIS) return
  try {
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    const ttlSeconds = Math.floor((cache.expiresAt - Date.now()) / 1000)
    if (ttlSeconds > 0) await redis.set('kis-token', cache, { ex: ttlSeconds })
  } catch {
    // Redis 저장 실패해도 무시
  }
}

// ── 파일 캐시 (로컬 dev) ────────────────────────────────────────────────
const TOKEN_FILE =
  process.env.NODE_ENV === 'production'
    ? '/tmp/.kis-token.json'
    : path.join(process.cwd(), '.kis-token.json')

function loadTokenFromFile(): TokenCache | null {
  if (HAS_REDIS) return null
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf-8')
    const cache = JSON.parse(raw) as TokenCache
    if (Date.now() < cache.expiresAt - 60_000) return cache
    return null
  } catch {
    return null
  }
}

function saveTokenToFile(cache: TokenCache) {
  if (HAS_REDIS) return
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(cache), 'utf-8')
  } catch {
    // 읽기 전용 파일시스템 등에서 실패해도 무시
  }
}

// ── 메모리 캐시 ─────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __kisTokenCache: TokenCache | null
  // eslint-disable-next-line no-var
  var __kisTokenPromise: Promise<string> | null
}
globalThis.__kisTokenCache ??= null
globalThis.__kisTokenPromise ??= null

async function getAccessToken(): Promise<string> {
  // 1순위: 메모리 캐시 (핫리로드 생존)
  if (globalThis.__kisTokenCache && Date.now() < globalThis.__kisTokenCache.expiresAt - 60_000) {
    return globalThis.__kisTokenCache.token
  }

  // 2순위: Redis (프로덕션) 또는 파일 캐시 (로컬 dev)
  const fromRedis = await redisGet()
  if (fromRedis) {
    globalThis.__kisTokenCache = fromRedis
    return fromRedis.token
  }
  const fromFile = loadTokenFromFile()
  if (fromFile) {
    globalThis.__kisTokenCache = fromFile
    return fromFile.token
  }

  // 동시 요청이 들어와도 토큰 발급은 1번만
  if (!globalThis.__kisTokenPromise) {
    globalThis.__kisTokenPromise = (async () => {
      const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: APP_KEY,
          appsecret: APP_SECRET,
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[KIS] 토큰 발급 실패:', res.status, body)
        throw new Error(`KIS token 발급 실패: ${res.status}`)
      }

      const data = (await res.json()) as { access_token: string; expires_in: number }
      const cache: TokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }
      globalThis.__kisTokenCache = cache
      await redisSet(cache)
      saveTokenToFile(cache)
      return cache.token
    })().finally(() => {
      globalThis.__kisTokenPromise = null
    })
  }

  return globalThis.__kisTokenPromise!
}

function baseHeaders(token: string, trId: string): Record<string, string> {
  return {
    'content-type': 'application/json; charset=UTF-8',
    authorization: `Bearer ${token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: trId,
    custtype: 'P',
  }
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export type StockPrice = {
  currentPrice: number
  changeRate: number
  openPrice: number
  highPrice: number
  lowPrice: number
  volume: number
}

export async function getStockPrice(code: string): Promise<StockPrice> {
  const token = await getAccessToken()
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
  })

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
    { headers: baseHeaders(token, 'FHKST01010100') }
  )

  const data = (await res.json()) as { rt_cd: string; msg1: string; output: Record<string, string> }
  if (data.rt_cd !== '0') {
    console.error('[KIS] getStockPrice 실패:', JSON.stringify(data))
    throw new Error(`KIS 현재가 조회 실패 [${code}]: ${data.msg1}`)
  }

  const o = data.output
  return {
    currentPrice: parseInt(o.stck_prpr, 10),
    changeRate: parseFloat(o.prdy_ctrt),
    openPrice: parseInt(o.stck_oprc, 10),
    highPrice: parseInt(o.stck_hgpr, 10),
    lowPrice: parseInt(o.stck_lwpr, 10),
    volume: parseInt(o.acml_vol, 10),
  }
}

export type Candle = {
  time: string
  open: number
  high: number
  low: number
  close: number
}

const PERIOD_DAYS: Record<string, number> = { '1D': 30, '1W': 90, '1M': 365, '3M': 1095 }
const PERIOD_DIV: Record<string, string> = { '1D': 'D', '1W': 'D', '1M': 'W', '3M': 'M' }

export async function getCandles(code: string, period: string): Promise<Candle[]> {
  const token = await getAccessToken()

  const days = PERIOD_DAYS[period] ?? 30
  const divCode = PERIOD_DIV[period] ?? 'D'

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: toDateStr(startDate),
    FID_INPUT_DATE_2: toDateStr(endDate),
    FID_PERIOD_DIV_CODE: divCode,
    FID_ORG_ADJ_PRC: '0',
  })

  void IS_MOCK
  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    { headers: baseHeaders(token, 'FHKST03010100') }
  )

  const data = (await res.json()) as {
    rt_cd: string
    msg1: string
    output2: Record<string, string>[]
  }
  if (data.rt_cd !== '0') throw new Error(`KIS 캔들 조회 실패 [${code}]: ${data.msg1}`)

  return (data.output2 ?? [])
    .map((item) => ({
      time: `${item.stck_bsop_date.slice(0, 4)}-${item.stck_bsop_date.slice(4, 6)}-${item.stck_bsop_date.slice(6, 8)}`,
      open: parseInt(item.stck_oprc, 10),
      high: parseInt(item.stck_hgpr, 10),
      low: parseInt(item.stck_lwpr, 10),
      close: parseInt(item.stck_clpr, 10),
    }))
    .reverse()
}

export type MarketIndex = {
  name: string
  value: number
  change: number
  changeRate: number
}

const INDEX_CODE: Record<string, string> = { KOSPI: '0001', KOSDAQ: '1001' }

export async function getMarketIndex(name: 'KOSPI' | 'KOSDAQ'): Promise<MarketIndex> {
  const token = await getAccessToken()
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: INDEX_CODE[name],
  })

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price?${params}`,
    { headers: baseHeaders(token, 'FHPUP02100000') }
  )

  const data = (await res.json()) as {
    rt_cd: string
    msg1: string
    output: Record<string, string>
  }
  if (data.rt_cd !== '0') {
    console.error('[KIS] getMarketIndex 실패:', JSON.stringify(data))
    throw new Error(`KIS 지수 조회 실패 [${name}]: ${data.msg1}`)
  }

  const o = data.output
  return {
    name,
    value: parseFloat(o.bstp_nmix_prpr),
    change: parseFloat(o.bstp_nmix_prdy_vrss),
    changeRate: parseFloat(o.bstp_nmix_prdy_ctrt),
  }
}
