/**
 * POST /api/sso/rehapp
 * Rehapp tarafından çağrılır. Email+şifre+org_slug doğrular, tek kullanımlık token döner.
 *
 * Body: { email, password, org_slug, rehapp_secret }
 * Response: { redirect_url: "https://bkds.rehapp.com/giris?token=xyz" }
 *
 * Güvenlik katmanları:
 *   1. rehapp_secret == SSO_SECRET (paylaşılan sır)
 *   2. email+password → kullanıcı gerçekten var mı?
 *   3. Kullanıcı o org_slug'ın kurumuna ait mi?
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
const TOKEN_TTL_SECONDS = 600; // 10 dakika

export async function POST(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.json({ error: 'SSO yapılandırılmamış' }, { status: 500 });
  }

  let body: {
    email?: string;
    password?: string;
    org_slug?: string;
    rehapp_secret?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 });
  }

  const { email, password, org_slug, rehapp_secret } = body;

  // 1. Shared secret doğrulama
  if (rehapp_secret !== SSO_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  if (!email || !password || !org_slug) {
    return NextResponse.json({ error: 'email, password ve org_slug zorunlu' }, { status: 400 });
  }

  // 2. Kurum kontrolü
  const org = await prisma.organization.findUnique({ where: { slug: org_slug } });
  if (!org || !org.active) {
    return NextResponse.json({ error: 'Kurum bulunamadı veya aktif değil', requested_slug: org_slug }, { status: 404 });
  }

  // 3. Kullanıcı doğrulama
  const user = await prisma.user.findFirst({
    where: { email, organizationId: org.id, active: true },
  });

  if (!user) {
    // Zamanlama saldırılarını önlemek için sahte hash karşılaştırması
    await bcrypt.compare(password, '$2a$10$fakehashfortimingatttackprevention');
    return NextResponse.json({ error: 'Kimlik bilgileri geçersiz' }, { status: 401 });
  }

  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    return NextResponse.json({ error: 'Kimlik bilgileri geçersiz' }, { status: 401 });
  }

  // 4. Tek kullanımlık SSO token üret
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  await prisma.ssoToken.create({
    data: {
      token,
      organizationId: org.id,
      role: user.role,
      expiresAt,
    },
  });

  const redirectUrl = `${APP_URL}/giris?token=${token}`;

  return NextResponse.json({ redirect_url: redirectUrl });
}
