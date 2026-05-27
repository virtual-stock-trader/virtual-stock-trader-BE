import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getMarketIndex } from '@/lib/kis'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const [kospiResult, kosdaqResult] = await Promise.allSettled([
    getMarketIndex('KOSPI'),
    getMarketIndex('KOSDAQ'),
  ])

  const indices = [kospiResult, kosdaqResult]
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never>).value)

  if (indices.length === 0) {
    return NextResponse.json(
      { error: { code: 'KIS_ERROR', message: '시장 지수 조회에 실패했습니다.' } },
      { status: 502 }
    )
  }

  return NextResponse.json(indices)
}
