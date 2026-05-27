import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { amount } = (await req.json()) as { amount?: number }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_AMOUNT', message: '유효한 투자금을 입력해주세요.' } },
      { status: 400 }
    )
  }

  const { error: holdingsError } = await supabaseAdmin
    .from('holdings')
    .delete()
    .eq('user_id', auth.userId)

  if (holdingsError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '보유 종목 청산 실패' } },
      { status: 500 }
    )
  }

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update({ initial_amount: amount, cash: amount })
    .eq('id', auth.userId)

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '투자금 재설정 실패' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
