import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LilaImportService } from '@/lib/services/lilaImportService';
import type { LilaImportRow } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const job = await prisma.importJob.create({
    data: { organizationId: orgId, fileName: file.name, status: 'isleniyor' },
  });

  try {
    const rows = parseLilaHtmlXls(buffer);

    await prisma.importJob.update({
      where: { id: job.id },
      data: { totalRows: rows.length },
    });

    const importService = new LilaImportService(orgId);
    const { success, errors } = await importService.processRows(rows, job.id);

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors.length > 0 ? (success > 0 ? 'tamamlandi' : 'hata') : 'tamamlandi',
        processedRows: success,
        errorRows: errors.length,
        errorDetails: errors.length > 0 ? JSON.stringify(errors) : null,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ jobId: job.id, success, errors: errors.length, errorDetails: errors });
  } catch (err: any) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'hata', errorDetails: JSON.stringify([{ reason: err.message }]), completedAt: new Date() },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);

  const jobs = await prisma.importJob.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // errorDetails DB'de JSON-string; client için parse et
  const parsedJobs = jobs.map(j => ({
    ...j,
    errorDetails: j.errorDetails ? safeJsonParse(j.errorDetails) : null,
  }));

  return NextResponse.json(parsedJobs);
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function parseLilaHtmlXls(buffer: Buffer): LilaImportRow[] {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const rows: LilaImportRow[] = [];

  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
      .map((cell) => cell.replace(/<[^>]+>/g, '').trim());

    if (cells.length < 7) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    if (!/\d{2}\.\d{2}\.\d{4}/.test(cells[1])) continue;

    const tarihRaw = cells[1].trim();
    const saatRaw = cells[2].trim();
    const ogrenciAdi = cells[3].trim();
    const derslik = cells[5].trim();
    const ogretmenAdi = cells[6].trim();

    if (!ogrenciAdi || !ogretmenAdi || !saatRaw) continue;

    const saatParts = saatRaw.split('-').map((s: string) => s.trim());
    const baslangicSaati = saatParts[0] ?? '00:00';
    const bitisSaati = saatParts[1] ?? '00:00';

    const [d, m, y] = tarihRaw.split('.');
    const tarih = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    rows.push({ ogrenciAdi, ogretmenAdi, tarih, baslangicSaati, bitisSaati, derslik });
  }

  return rows;
}
