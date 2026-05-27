import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as 'buy' | 'sell' | null
  const limit = searchParams.get('limit')
  const offset = searchParams.get('offset')

  let query = supabaseAdmin
    .from('transactions')
    .select('id, code, type, quantity, price, total, traded_at, stocks ( name )')
    .eq('user_id', auth.userId)
    .order('traded_at', { ascending: false })

  if (type) query = query.eq('type', type)

  const numLimit = limit ? parseInt(limit, 10) : undefined
  const numOffset = offset ? parseInt(offset, 10) : undefined

  if (numLimit !== undefined && numOffset !== undefined) {
    query = query.range(numOffset, numOffset + numLimit - 1)
  } else if (numLimit !== undefined) {
    query = query.limit(numLimit)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '거래 내역 조회 실패' } },
      { status: 500 }
    )
  }

  type TxRow = {
    id: string
    code: string
    type: string
    quantity: number
    price: number
    total: number
    traded_at: string
    stocks: { name: string } | null
  }

  return NextResponse.json(
    (data ?? []).map((row) => {
      const r = row as unknown as TxRow
      return {
        id: r.id,
        code: r.code,
        name: r.stocks?.name ?? r.code,
        type: r.type,
        quantity: r.quantity,
        price: r.price,
        total: r.total,
        date: r.traded_at.slice(0, 10),
      }
    })
  )
}
