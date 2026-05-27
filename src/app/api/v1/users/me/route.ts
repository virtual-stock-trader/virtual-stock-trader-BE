import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, is_onboarded, initial_amount, cash')
    .eq('id', auth.userId)
    .single()

  if (error || !data) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('user_profiles')
      .insert({ id: auth.userId })
      .select('id, is_onboarded, initial_amount, cash')
      .single()

    if (createError || !created) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: '프로필 조회 실패' } },
        { status: 500 }
      )
    }

    return NextResponse.json({
      id: created.id,
      isOnboarded: created.is_onboarded,
      initialAmount: created.initial_amount,
      cash: created.cash,
    })
  }

  return NextResponse.json({
    id: data.id,
    isOnboarded: data.is_onboarded,
    initialAmount: data.initial_amount,
    cash: data.cash,
  })
}
