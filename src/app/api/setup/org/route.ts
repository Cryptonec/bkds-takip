/**
 * POST /api/setup/org
 * Deploy sonrası uzaktan kurum + admin oluşturmak için kullanılır.
 * Render Shell erişimi olmayan durumlarda localden curl ile çağrılır.
 *
 * Güvenlik: SSO_SECRET ile korunur (body.secret == SSO_SECRET)
 *
 * Body: { secret, slug, name, adminEmail, adminPassword }
 * Response: { org, user }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const SSO_SECRET = process.env.SSO_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.json({ error: 'SSO_SECRET yapılandırılmamış' }, { status: 500 });
  }

  let body: {
    secret?: string;
    slug?: string;
    name?: string;
    adminEmail?: string;
    adminPassword?: string;
    plan?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
  }

  if (body.secret !== SSO_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  const { slug, name, adminEmail, adminPassword, plan = 'basic' } = body;
  if (!slug || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: 'slug, adminEmail ve adminPassword zorunlu' },
      { status: 400 }
    );
  }

  const orgName = name ?? `Kurum ${slug}`;
  const hashedPw = await bcrypt.hash(adminPassword, 12);

  // Idempotent: varsa güncelle, yoksa oluştur
  const org = await prisma.organization.upsert({
    where: { slug },
    create: { slug, name: orgName, plan: plan as any, active: true },
    update: { name: orgName, active: true },
  });

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: `${orgName} Admin`,
      password: hashedPw,
      role: 'admin',
      organizationId: org.id,
      active: true,
    },
    update: {
      password: hashedPw,
      organizationId: org.id,
      active: true,
    },
  });

  return NextResponse.json({
    ok: true,
    org: { id: org.id, slug: org.slug, name: org.name },
    user: { id: user.id, email: user.email, role: user.role },
  });
}
