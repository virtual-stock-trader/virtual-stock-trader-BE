import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { code } = await params

  const { error } = await supabaseAdmin
    .from('favorites')
    .upsert({ user_id: auth.userId, code }, { onConflict: 'user_id,code' })

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '즐겨찾기 추가 실패' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  const { code } = await params

  const { error } = await supabaseAdmin
    .from('favorites')
    .delete()
    .eq('user_id', auth.userId)
    .eq('code', code)

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '즐겨찾기 삭제 실패' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
