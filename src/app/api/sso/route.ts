/**
 * SSO Endpoint — Rehapp (FastAPI) → bkds-takip geçişi
 *
 * Akış:
 *   1. Rehapp FastAPI, kullanıcı "BKDS Takip" butonuna bastığında
 *      shared secret ile imzalanmış bir JWT üretir.
 *   2. Frontend'i /api/sso?token=<JWT> adresine yönlendirir.
 *   3. bkds-takip token'ı doğrular, kullanıcıyı oturum açmış sayar
 *      ve /dashboard'a yönlendirir.
 *
 * Rehapp tarafında token üretimi (Python örneği):
 *   import jwt, time
 *   payload = {
 *     "sub": str(user.id),
 *     "email": user.email,
 *     "name": user.full_name,
 *     "role": "admin",           # admin | yonetici | danisma
 *     "org_id": str(org.id),     # Rehapp'taki kurum ID'si
 *     "org_slug": org.slug,      # bkds-takip'teki Organization.slug ile eşleşmeli
 *     "iat": int(time.time()),
 *     "exp": int(time.time()) + 300,  # 5 dakika geçerli
 *   }
 *   token = jwt.encode(payload, settings.BKDS_SSO_SECRET, algorithm="HS256")
 *   redirect_url = f"{settings.BKDS_APP_URL}/api/sso?token={token}"
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, timingSafeEqual } from 'crypto';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const BKDS_APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

/** Minimal HMAC-SHA256 JWT doğrulama (jose veya jsonwebtoken gerektirmez) */
function verifyHs256Jwt(token: string, secret: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const expectedSig = createHash('sha256')
    .update(secret + data) // HMAC-SHA256 basit impl
    .digest('base64url');

  // Timing-safe karşılaştırma
  try {
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    // Süre kontrolü
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

  const payload = verifyHs256Jwt(token, SSO_SECRET);
  if (!payload) {
    return NextResponse.redirect(new URL('/giris?error=sso_gecersiz', BKDS_APP_URL));
  }

  const { email, name, role, org_slug } = payload;

  if (!email || !org_slug) {
    return NextResponse.redirect(new URL('/giris?error=sso_eksik_alan', BKDS_APP_URL));
  }

  // Kurumu bul
  const org = await prisma.organization.findUnique({ where: { slug: org_slug } });
  if (!org || !org.active) {
    return NextResponse.redirect(new URL('/giris?error=kurum_bulunamadi', BKDS_APP_URL));
  }

  // Abonelik kontrolü
  const sub = await prisma.subscription.findUnique({ where: { organizationId: org.id } });
  const subOk = !sub || ['aktif', 'deneme'].includes(sub.status);
  if (!sub || !subOk) {
    return NextResponse.redirect(new URL('/giris?error=abonelik_gecersiz', BKDS_APP_URL));
  }

  // Kullanıcıyı bul veya oluştur (SSO ile giriş)
  const validRole = ['admin', 'yonetici', 'danisma'].includes(role) ? role : 'danisma';
  let user = await prisma.user.findFirst({
    where: { email, organizationId: org.id },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name ?? email,
        organizationId: org.id,
        role: validRole as any,
        active: true,
        password: null as any, // SSO kullanıcısı
      },
    });
  } else if (!user.active) {
    return NextResponse.redirect(new URL('/giris?error=kullanici_pasif', BKDS_APP_URL));
  }

  // Tek kullanımlık SSO token'ı DB'ye kaydet
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

  // NextAuth oturum başlatmak için /api/sso/callback'e yönlendir
  const callbackUrl = new URL('/api/sso/callback', BKDS_APP_URL);
  callbackUrl.searchParams.set('token', token);
  return NextResponse.redirect(callbackUrl);
}
