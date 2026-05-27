import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getStockPrice } from '@/lib/kis'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { code, type, quantity } = (await req.json()) as {
    code?: string
    type?: 'buy' | 'sell'
    quantity?: number
  }

  if (
    !code ||
    !type ||
    !quantity ||
    !['buy', 'sell'].includes(type) ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: '잘못된 주문 요청입니다.' } },
      { status: 400 }
    )
  }

  const { data: stock, error: stockError } = await supabaseAdmin
    .from('stocks')
    .select('code, name')
    .eq('code', code)
    .single()

  if (stockError || !stock) {
    return NextResponse.json(
      { error: { code: 'STOCK_NOT_FOUND', message: '존재하지 않는 종목입니다.' } },
      { status: 404 }
    )
  }

  let currentPrice: number
  try {
    const price = await getStockPrice(code)
    currentPrice = price.currentPrice
  } catch {
    return NextResponse.json(
      { error: { code: 'KIS_ERROR', message: '현재가 조회에 실패했습니다.' } },
      { status: 502 }
    )
  }

  const { data, error } = await supabaseAdmin.rpc('place_order', {
    p_user_id: auth.userId,
    p_code: code,
    p_type: type,
    p_quantity: quantity,
    p_price: currentPrice,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('INSUFFICIENT_CASH')) {
      return NextResponse.json(
        { error: { code: 'INSUFFICIENT_CASH', message: '예수금이 부족합니다.' } },
        { status: 400 }
      )
    }
    if (msg.includes('INSUFFICIENT_HOLDINGS')) {
      return NextResponse.json(
        { error: { code: 'INSUFFICIENT_HOLDINGS', message: '보유 수량이 부족합니다.' } },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '주문 처리 실패' } },
      { status: 500 }
    )
  }

  const tx = data as {
    id: string
    code: string
    type: string
    quantity: number
    price: number
    total: number
    traded_at: string
  }

  return NextResponse.json({
    success: true,
    transaction: {
      id: tx.id,
      code: tx.code,
      name: stock.name,
      type: tx.type,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      tradedAt: tx.traded_at,
    },
  })
}
