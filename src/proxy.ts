import { NextRequest, NextResponse } from 'next/server'

export function proxy(req: NextRequest) {
  const origin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  const res = NextResponse.next()
  res.headers.set('Access-Control-Allow-Origin', origin)
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

export const config = {
  matcher: '/api/:path*',
}
