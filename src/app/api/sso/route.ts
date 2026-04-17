/**
 * SSO Endpoint — Rehapp (FastAPI) → bkds-takip geçişi
 *
 * Rehapp SHA256(secret + header.payload) ile imzalıyor (non-standard).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const BKDS_APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

function verifyToken(token: string, secret: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  // Rehapp: SHA256(secret + data) — non-standard ama bu şekilde üretiyor
  const expectedSig = createHash('sha256').update(secret + data).digest('base64url');

  try {
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.json({ error: 'SSO yapılandırılmamış' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/giris?error=sso_token_eksik', BKDS_APP_URL));
  }

  const payload = verifyToken(token, SSO_SECRET);
  if (!payload) {
    console.error('[SSO] Token doğrulama başarısız');
    return NextResponse.redirect(new URL('/giris?error=sso_gecersiz', BKDS_APP_URL));
  }

  const org_slug = payload.org_slug;
  const role = payload.role;
  const email: string = payload.email ?? `${payload.meb_username}@bkds.sso`;
  const name: string = payload.name ?? payload.meb_username ?? email;

  if (!org_slug) {
    return NextResponse.redirect(new URL('/giris?error=sso_eksik_alan', BKDS_APP_URL));
  }

  const org = await prisma.organization.findUnique({ where: { slug: org_slug } });
  if (!org || !org.active) {
    return NextResponse.redirect(new URL('/giris?error=kurum_bulunamadi', BKDS_APP_URL));
  }

  try {
    const sub = await (prisma as any).subscription?.findUnique({ where: { organizationId: org.id } });
    if (sub && !['aktif', 'deneme'].includes(sub.status)) {
      return NextResponse.redirect(new URL('/giris?error=abonelik_gecersiz', BKDS_APP_URL));
    }
  } catch {
    // Subscription tablosu yok — geç
  }

  const validRole = ['admin', 'yonetici', 'danisma'].includes(role) ? role : 'danisma';
  let user = await prisma.user.findFirst({ where: { email, organizationId: org.id } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name ?? email,
        organizationId: org.id,
        role: validRole as any,
        active: true,
        password: randomBytes(32).toString('hex'), // SSO kullanıcısı — giriş yapamaz
      },
    });
  } else if (!user.active) {
    return NextResponse.redirect(new URL('/giris?error=kullanici_pasif', BKDS_APP_URL));
  }

  try {
    await prisma.ssoToken.create({
      data: {
        token,
        organizationId: org.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  } catch {
    // SsoToken tablosu yoksa devam et
  }

  const callbackUrl = new URL('/api/sso/callback', BKDS_APP_URL);
  callbackUrl.searchParams.set('token', token);
  return NextResponse.redirect(callbackUrl);
}
