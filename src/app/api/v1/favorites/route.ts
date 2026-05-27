import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('favorites')
    .select('code, stocks ( name )')
    .eq('user_id', auth.userId)

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '즐겨찾기 조회 실패' } },
      { status: 500 }
    )
  }

  type FavRow = { code: string; stocks: { name: string }[] | null }
  return NextResponse.json(
    (data ?? []).map((r) => {
      const row = r as unknown as FavRow
      return { code: row.code, name: row.stocks?.[0]?.name ?? row.code }
    })
  )
}
