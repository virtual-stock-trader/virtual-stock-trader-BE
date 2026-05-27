import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getStockPrice } from '@/lib/kis'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { code } = await params

  const { data: stock, error } = await supabaseAdmin
    .from('stocks')
    .select('code, name, market')
    .eq('code', code)
    .single()

  if (error || !stock) {
    return NextResponse.json(
      { error: { code: 'STOCK_NOT_FOUND', message: '존재하지 않는 종목입니다.' } },
      { status: 404 }
    )
  }

  let price
  try {
    price = await getStockPrice(code)
  } catch {
    return NextResponse.json(
      { error: { code: 'KIS_ERROR', message: '시세 조회에 실패했습니다.' } },
      { status: 502 }
    )
  }

  return NextResponse.json({ code: stock.code, name: stock.name, market: stock.market, ...price })
}
