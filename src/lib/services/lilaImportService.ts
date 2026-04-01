import { prisma } from '@/lib/prisma';
import { normalizeName, normalizeDerslik, parseTarihSaat } from '@/lib/utils/normalize';
import type { LilaImportRow } from '@/types';

export class LilaImportService {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  async processRows(
    rows: LilaImportRow[],
    importJobId: string
  ): Promise<{ success: number; errors: Array<{ row: number; reason: string }> }> {
    const errors: Array<{ row: number; reason: string }> = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.processRow(row, importJobId);
        success++;
      } catch (err: any) {
        errors.push({ row: i + 2, reason: err.message ?? 'Bilinmeyen hata' });
      }
      if (i % 10 === 0) {
        await prisma.importJob.update({
          where: { id: importJobId },
          data: { processedRows: i + 1 },
        });
      }
    }

    return { success, errors };
  }

  private async processRow(row: LilaImportRow, importJobId: string): Promise<void> {
    const orgId = this.organizationId;

    const normOgrenci = normalizeName(row.ogrenciAdi);
    let student = await prisma.student.findFirst({ where: { organizationId: orgId, normalizedName: normOgrenci } });
    if (!student) {
      student = await prisma.student.create({
        data: { organizationId: orgId, adSoyad: row.ogrenciAdi.trim(), normalizedName: normOgrenci },
      });
    }

    const normOgretmen = normalizeName(row.ogretmenAdi);
    let staff = await prisma.staff.findFirst({ where: { organizationId: orgId, normalizedName: normOgretmen } });
    if (!staff) {
      staff = await prisma.staff.create({
        data: { organizationId: orgId, adSoyad: row.ogretmenAdi.trim(), normalizedName: normOgretmen },
      });
    }

    const { normalized: derslikNorm, bkdsRequired } = normalizeDerslik(row.derslik);
    const baslangic = parseTarihSaat(row.tarih, row.baslangicSaati);
    const bitis = parseTarihSaat(row.tarih, row.bitisSaati);
    const tarihDate = new Date(baslangic);
    tarihDate.setHours(0, 0, 0, 0);

    const existing = await prisma.lessonSession.findFirst({
      where: { organizationId: orgId, studentId: student.id, staffId: staff.id, baslangic, bitis },
    });
    if (!existing) {
      await prisma.lessonSession.create({
        data: {
          organizationId: orgId,
          studentId: student.id,
          staffId: staff.id,
          tarih: tarihDate,
          baslangic,
          bitis,
          derslik: derslikNorm,
          bkdsRequired,
          importJobId,
        },
      });
    }

    const existingStaff = await prisma.staffSession.findFirst({
      where: { organizationId: orgId, staffId: staff.id, baslangic, bitis },
    });
    if (!existingStaff) {
      await prisma.staffSession.create({
        data: {
          organizationId: orgId,
          staffId: staff.id,
          tarih: tarihDate,
          baslangic,
          bitis,
          derslik: derslikNorm,
        },
      });
    }
  }
}
