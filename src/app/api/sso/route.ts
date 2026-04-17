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
import { createHash, createHmac, timingSafeEqual } from 'crypto';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const BKDS_APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

/**
 * SSO token doğrulaması.
 * Rehapp'ın hangi imza stilini kullandığı %100 netleşene dek birkaç yaygın
 * varyasyonu deniyoruz:
 *   1. Standart HMAC-SHA256 (PyJWT `algorithm="HS256"`) — base64url imza
 *   2. `SHA256(secret + data)` hex  — özel impl (Rehapp'ta kullanıldığı söyleniyor)
 *   3. `SHA256(secret + data)` base64url
 *   4. `SHA256(data + secret)` hex / base64url
 * Hangisi eşleşirse payload dönüyor. Eşleşme olmazsa console'a detay
 * basıyoruz ki gerçek algoritma kolayca tespit edilsin.
 */
function verifySsoToken(token: string, secret: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('[SSO] Token 3 parça değil:', parts.length);
    return null;
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const candidates: Record<string, string> = {
    'HMAC-SHA256 base64url': createHmac('sha256', secret).update(data).digest('base64url'),
    'HMAC-SHA256 hex': createHmac('sha256', secret).update(data).digest('hex'),
    'SHA256(secret+data) base64url': createHash('sha256').update(secret + data).digest('base64url'),
    'SHA256(secret+data) hex': createHash('sha256').update(secret + data).digest('hex'),
    'SHA256(data+secret) base64url': createHash('sha256').update(data + secret).digest('base64url'),
    'SHA256(data+secret) hex': createHash('sha256').update(data + secret).digest('hex'),
  };

  let matched: string | null = null;
  for (const [label, expected] of Object.entries(candidates)) {
    if (sigB64.length !== expected.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(sigB64), Buffer.from(expected))) {
        matched = label;
        break;
      }
    } catch {
      // length farkı gibi durumlar
    }
  }

  if (!matched) {
    console.error('[SSO] İmza eşleşmedi. Gelen sig:', sigB64);
    console.error('[SSO] Denenen adaylar:');
    for (const [label, expected] of Object.entries(candidates)) {
      console.error(`  - ${label.padEnd(32)} = ${expected}`);
    }
    console.error('[SSO] Header (b64):', headerB64);
    console.error('[SSO] Payload (b64):', payloadB64);
    try {
      console.error('[SSO] Header (decoded):', Buffer.from(headerB64, 'base64url').toString('utf-8'));
      console.error('[SSO] Payload (decoded):', Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      /* ignore */
    }
    return null;
  }

  console.log('[SSO] İmza eşleşti:', matched);

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.error('[SSO] Token süresi dolmuş. exp:', payload.exp, 'now:', Math.floor(Date.now() / 1000));
      return null;
    }
    return payload;
  } catch (e) {
    console.error('[SSO] Payload JSON parse hatası:', e);
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

  const payload = verifySsoToken(token, SSO_SECRET);
  if (!payload) {
    return NextResponse.redirect(new URL('/giris?error=sso_gecersiz', BKDS_APP_URL));
  }

  const { role, org_slug, meb_username } = payload;

  // Rehapp token'ında `email` alanı yoksa `meb_username`'den türet.
  // Kullanıcı `User` tablosunda `@@unique([email, organizationId])` ile
  // organizasyon bazında tekil tutulduğu için deterministik bir sentetik
  // e-posta yeterli.
  const email: string | undefined =
    payload.email ?? (meb_username ? `${meb_username}@meb.local` : undefined);
  const name: string | undefined = payload.name ?? meb_username ?? email;

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

  // Tek kullanımlık SSO token'ı DB'ye kaydet (upsert: yenile/geri durumuna dayanıklı)
  // Replay koruması callback'teki `usedAt` kontrolü ile sağlanır.
  await prisma.ssoToken.upsert({
    where: { token },
    create: {
      token,
      organizationId: org.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
    update: {
      // Var olan kaydın usedAt değerine dokunma — replay'i callback engeller.
      organizationId: org.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });

  // NextAuth oturum başlatmak için /api/sso/callback'e yönlendir
  const callbackUrl = new URL('/api/sso/callback', BKDS_APP_URL);
  callbackUrl.searchParams.set('token', token);
  return NextResponse.redirect(callbackUrl);
}
