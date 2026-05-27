import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getCandles } from '@/lib/kis'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { code } = await params
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? '1M'

  let candles
  try {
    candles = await getCandles(code, period)
  } catch {
    return NextResponse.json(
      { error: { code: 'KIS_ERROR', message: '캔들 데이터 조회에 실패했습니다.' } },
      { status: 502 }
    )
  }

  return NextResponse.json(candles)
}
