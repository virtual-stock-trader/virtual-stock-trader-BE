import { NextRequest, NextResponse } from 'next/server'

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim())

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function proxy(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const isAllowed = allowedOrigins.includes(origin)

  if (req.method === 'OPTIONS') {
    return NextResponse.json(
      {},
      {
        headers: {
          ...(isAllowed && { 'Access-Control-Allow-Origin': origin }),
          ...corsHeaders,
        },
      },
    )
  }

  const res = NextResponse.next()
  if (isAllowed) {
    res.headers.set('Access-Control-Allow-Origin', origin)
  }
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export const config = {
  matcher: '/api/:path*',
}
