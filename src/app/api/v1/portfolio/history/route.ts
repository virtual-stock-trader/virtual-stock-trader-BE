import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const numDays = parseInt(searchParams.get('days') ?? '30', 10) || 30

  const from = new Date()
  from.setDate(from.getDate() - numDays)

  const { data, error } = await supabaseAdmin
    .from('asset_history')
    .select('snapshot_date, total_value')
    .eq('user_id', auth.userId)
    .gte('snapshot_date', from.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '자산 추이 조회 실패' } },
      { status: 500 }
    )
  }

  return NextResponse.json(
    (data ?? []).map((row) => ({
      date: row.snapshot_date.slice(5).replace('-', '/'),
      value: row.total_value,
    }))
  )
}
