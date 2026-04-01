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

  if (!token) {
    return NextResponse.redirect(new URL('/giris?error=sso_callback_token_eksik', BKDS_APP_URL));
  }

  const ssoRecord = await prisma.ssoToken.findUnique({ where: { token } });

  if (!ssoRecord || ssoRecord.usedAt || ssoRecord.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/giris?error=sso_token_kullanilmis', BKDS_APP_URL));
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
    return NextResponse.redirect(new URL('/giris?error=kurum_bulunamadi', BKDS_APP_URL));
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

  // NextAuth session cookie'si
  const cookieName = BKDS_APP_URL.startsWith('https')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const response = NextResponse.redirect(new URL('/dashboard', BKDS_APP_URL));
  response.cookies.set(cookieName, jwtToken, {
    httpOnly: true,
    secure: BKDS_APP_URL.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}
