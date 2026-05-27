import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const market = searchParams.get('market')

  let query = supabaseAdmin.from('stocks').select('code, name, market')
  if (market) query = query.eq('market', market)

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '종목 목록 조회 실패' } },
      { status: 500 }
    )
  }

  return NextResponse.json(data ?? [])
}
