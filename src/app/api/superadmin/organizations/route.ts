/**
 * GET  /api/superadmin/organizations  — tüm kurumları listele
 * POST /api/superadmin/organizations  — yeni kurum + admin oluştur
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'superadmin') {
    return null;
  }
  return session;
}

export async function GET() {
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { users: true, students: true } },
    },
  });

  return NextResponse.json(orgs);
}

export async function POST(req: NextRequest) {
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  let body: {
    slug?: string;
    name?: string;
    adminEmail?: string;
    adminPassword?: string;
    plan?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }

  const { slug, name, adminEmail, adminPassword, plan = 'basic' } = body;

  if (!slug || !name || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: 'slug, name, adminEmail ve adminPassword zorunlu' },
      { status: 400 }
    );
  }

  // slug çakışma kontrolü
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: `"${slug}" slug zaten kullanımda` }, { status: 409 });
  }

  const hashedPw = await bcrypt.hash(adminPassword, 12);

  const org = await prisma.organization.create({
    data: {
      slug,
      name,
      plan: plan as any,
      active: true,
      users: {
        create: {
          email: adminEmail,
          name: `${name} Admin`,
          password: hashedPw,
          role: 'admin',
          active: true,
        },
      },
    },
    include: { users: { select: { id: true, email: true, role: true } } },
  });

  return NextResponse.json(org, { status: 201 });
}
