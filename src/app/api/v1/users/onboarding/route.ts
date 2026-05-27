import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { amount } = (await req.json()) as { amount?: number }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_AMOUNT', message: '유효한 투자금을 입력해주세요.' } },
      { status: 400 }
    )
  }

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('is_onboarded')
    .eq('id', auth.userId)
    .single()

  if (profile?.is_onboarded) {
    return NextResponse.json(
      { error: { code: 'ALREADY_ONBOARDED', message: '이미 온보딩이 완료된 사용자입니다.' } },
      { status: 409 }
    )
  }

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .upsert({ id: auth.userId, initial_amount: amount, cash: amount, is_onboarded: true })

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '온보딩 처리 실패' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
