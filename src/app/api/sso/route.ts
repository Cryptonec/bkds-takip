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
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const BKDS_APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  if (!SSO_SECRET) {
    console.error('[SSO] SSO_SECRET env değişkeni ayarlanmamış');
    return NextResponse.json({ error: 'SSO yapılandırılmamış' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/giris?error=sso_token_eksik', BKDS_APP_URL));
  }

  // jose ile HS256 doğrulama — PyJWT ile tam uyumlu
  let payload: Record<string, any>;
  try {
    const secretKey = new TextEncoder().encode(SSO_SECRET);
    const { payload: verified } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    payload = verified as Record<string, any>;
    console.log('[SSO] Token geçerli, payload:', JSON.stringify(payload));
  } catch (err: any) {
    console.error('[SSO] JWT doğrulama hatası:', err?.message ?? err);
    console.error('[SSO] SSO_SECRET uzunluğu:', SSO_SECRET.length, '| ilk 4 karakter:', SSO_SECRET.slice(0, 4));
    return NextResponse.redirect(new URL('/giris?error=sso_gecersiz', BKDS_APP_URL));
  }

  const org_slug = payload.org_slug;
  const role = payload.role;
  // email yoksa meb_username'den türet
  const email: string = payload.email ?? `${payload.meb_username}@bkds.sso`;
  const name: string = payload.name ?? payload.meb_username ?? email;

  if (!org_slug) {
    return NextResponse.redirect(new URL('/giris?error=sso_eksik_alan', BKDS_APP_URL));
  }

  // Kurumu bul
  const org = await prisma.organization.findUnique({ where: { slug: org_slug } });
  if (!org || !org.active) {
    console.error('[SSO] Kurum bulunamadı veya pasif, org_slug:', org_slug);
    return NextResponse.redirect(new URL('/giris?error=kurum_bulunamadi', BKDS_APP_URL));
  }

  // Abonelik kontrolü (tablo yoksa veya kayıt yoksa izin ver)
  try {
    const sub = await (prisma as any).subscription?.findUnique({ where: { organizationId: org.id } });
    if (sub && !['aktif', 'deneme'].includes(sub.status)) {
      return NextResponse.redirect(new URL('/giris?error=abonelik_gecersiz', BKDS_APP_URL));
    }
  } catch {
    // Subscription tablosu henüz yok — geç
  }

  // Kullanıcıyı bul veya oluştur
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
        password: null as any,
      },
    });
  } else if (!user.active) {
    return NextResponse.redirect(new URL('/giris?error=kullanici_pasif', BKDS_APP_URL));
  }

  // Tek kullanımlık SSO token'ı DB'ye kaydet
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
  } catch (err) {
    console.error('[SSO] SsoToken kaydedilemedi:', err);
    // Devam et — kritik değil
  }

  // NextAuth oturum başlatmak için /api/sso/callback'e yönlendir
  const callbackUrl = new URL('/api/sso/callback', BKDS_APP_URL);
  callbackUrl.searchParams.set('token', token);
  return NextResponse.redirect(callbackUrl);
}
