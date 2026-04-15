/**
 * GET  /api/sso?token=<jwt>  — rehapp-backend JWT'sini doğrular, /giris'e yönlendirir
 * POST /api/sso              — org_slug + secret ile hex token üretir
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

const SSO_SECRET = process.env.SSO_SECRET ?? '';
const APP_URL = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN_TTL_SECONDS = 600; // 10 dakika

// ── JWT doğrulama ─────────────────────────────────────────────────────────────

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(pad), 'base64').toString('utf-8');
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expected = crypto
    .createHash('sha256')
    .update(secret + data, 'utf8')
    .digest()
    .toString('base64url');
  if (sig !== expected) return null;
  try {
    const claims = JSON.parse(b64urlDecode(payload)) as Record<string, unknown>;
    const exp = typeof claims.exp === 'number' ? claims.exp : 0;
    if (exp && exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ── GET /api/sso?token=<jwt> ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.redirect(new URL('/giris?error=SSONotConfigured', APP_URL));
  }
  const jwtToken = req.nextUrl.searchParams.get('token');
  if (!jwtToken) {
    return NextResponse.redirect(new URL('/giris?error=NoToken', APP_URL));
  }
  const claims = verifyJwt(jwtToken, SSO_SECRET);
  if (!claims) {
    return NextResponse.redirect(new URL('/giris?error=InvalidToken', APP_URL));
  }
  const orgSlug = String(claims.org_slug ?? claims.org_id ?? '');
  if (!orgSlug) {
    return NextResponse.redirect(new URL('/giris?error=NoOrg', APP_URL));
  }
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org || !org.active) {
    return NextResponse.redirect(new URL('/giris?error=OrgNotFound&slug=' + orgSlug, APP_URL));
  }
  // MEB kimlik bilgilerini kaydet / güncelle
  const mebUsername = String(claims.meb_username ?? '').trim();
  const mebPassword = String(claims.meb_password ?? '').trim();
  if (mebUsername && mebPassword) {
    await prisma.bkdsCredential.upsert({
      where:  { organizationId: org.id },
      create: { organizationId: org.id, username: mebUsername, password: mebPassword, cityId: '', districtId: '', remId: '' },
      update: { username: mebUsername, password: mebPassword },
    });
  }

  const hexToken  = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  await prisma.ssoToken.create({
    data: { token: hexToken, organizationId: org.id, role: String(claims.role ?? 'admin') as any, expiresAt },
  });
  return NextResponse.redirect(new URL(`/giris?token=${hexToken}`, APP_URL));
}

// ── POST /api/sso ─────────────────────────────────────────────────────────────

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

  const validRoles = ['admin', 'yonetici', 'danisma'];
  const safeRole = validRoles.includes(role) ? role : 'admin';

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  await prisma.ssoToken.create({
    data: { token, organizationId: org.id, role: safeRole as any, expiresAt },
  });

  const redirectUrl = `${APP_URL}/api/sso/callback?token=${token}`;
  return NextResponse.json({ redirect_url: redirectUrl });
}
