import { NextRequest, NextResponse } from 'next/server'
import { supabase } from './supabase'

type AuthSuccess = { userId: string; accessToken: string; error: null }
type AuthFailure = { userId: null; accessToken: null; error: NextResponse }

export async function requireAuth(req: NextRequest): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get('authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return {
      userId: null,
      accessToken: null,
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증 토큰이 없습니다.' } },
        { status: 401 }
      ),
    }
  }

  const token = authHeader.slice(7)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    return {
      userId: null,
      accessToken: null,
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '유효하지 않거나 만료된 토큰입니다.' } },
        { status: 401 }
      ),
    }
  }

  return { userId: user.id, accessToken: token, error: null }
}
