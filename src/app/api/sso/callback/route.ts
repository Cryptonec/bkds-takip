/**
 * SSO Callback — tek kullanımlık token ile NextAuth oturumu başlatır.
 * /api/sso/route.ts tarafından yönlendirilir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encode } from 'next-auth/jwt';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? '';
const BKDS_APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  // İsteğin gerçek origin'ini belirle (proxy/IP erişimi için)
  const proto = req.headers.get('x-forwarded-proto') ?? (BKDS_APP_URL.startsWith('https') ? 'https' : 'http');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(BKDS_APP_URL).host;
  const requestOrigin = `${proto}://${host}`;

  if (!token) {
    return NextResponse.redirect(new URL('/giris?error=sso_callback_token_eksik', requestOrigin));
  }

  const ssoRecord = await prisma.ssoToken.findUnique({ where: { token } });

  if (!ssoRecord || ssoRecord.usedAt || ssoRecord.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/giris?error=sso_token_kullanilmis', requestOrigin));
  }

  // Tek kullanımlık — hemen işaretle
  await prisma.ssoToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  // NextAuth JWT oluştur
  const org = await prisma.organization.findUnique({
    where: { id: ssoRecord.organizationId },
    select: { id: true, slug: true },
  });

  if (!org) {
    return NextResponse.redirect(new URL('/giris?error=kurum_bulunamadi', requestOrigin));
  }

  const jwtToken = await encode({
    secret: NEXTAUTH_SECRET,
    token: {
      sub: ssoRecord.userId ?? undefined,
      id: ssoRecord.userId ?? undefined,
      email: ssoRecord.email,
      name: ssoRecord.name,
      role: ssoRecord.role,
      organizationId: org.id,
      organizationSlug: org.slug,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 gün
    },
  });

  // NextAuth session cookie'si — istek protokolüne göre belirle
  const isHttps = requestOrigin.startsWith('https');
  const cookieName = isHttps
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const response = NextResponse.redirect(new URL('/ekran', requestOrigin));
  response.cookies.set(cookieName, jwtToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}
