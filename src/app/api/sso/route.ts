/**
 * POST /api/sso
 * Rehapp tarafından çağrılır. Geçerli bir SSO token üretir ve redirect URL döner.
 *
 * Body: { org_slug: string, role?: "admin"|"yonetici"|"danisma", secret: string }
 * Response: { redirect_url: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
const TOKEN_TTL_SECONDS = 120; // 2 dakika

export async function POST(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.json({ error: 'SSO yapılandırılmamış' }, { status: 500 });
  }

  let body: { org_slug?: string; role?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 });
  }

  const { org_slug, role = 'admin', secret } = body;

  // Shared secret doğrulama
  if (secret !== SSO_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  if (!org_slug) {
    return NextResponse.json({ error: 'org_slug zorunlu' }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({ where: { slug: org_slug } });
  if (!org || !org.active) {
    return NextResponse.json({ error: 'Kurum bulunamadı veya aktif değil' }, { status: 404 });
  }

  // Geçerli rol kontrolü
  const validRoles = ['admin', 'yonetici', 'danisma'];
  const safeRole = validRoles.includes(role) ? role : 'admin';

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  await prisma.ssoToken.create({
    data: {
      token,
      organizationId: org.id,
      role: safeRole as any,
      expiresAt,
    },
  });

  const redirectUrl = `${APP_URL}/api/sso/callback?token=${token}`;

  return NextResponse.json({ redirect_url: redirectUrl });
}
