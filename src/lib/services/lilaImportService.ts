import { prisma } from '@/lib/prisma';
import { normalizeName, normalizeDerslik, parseTarihSaat } from '@/lib/utils/normalize';
import type { LilaImportRow } from '@/types';

export class LilaImportService {
  async processRows(
    rows: LilaImportRow[],
    importJobId: string,
    organizationId: string
  ): Promise<{ success: number; errors: Array<{ row: number; reason: string }> }> {
    const errors: Array<{ row: number; reason: string }> = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.processRow(row, importJobId, organizationId);
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

  private async processRow(row: LilaImportRow, importJobId: string, organizationId: string): Promise<void> {
    // Öğrenci bul veya oluştur
    const normOgrenci = normalizeName(row.ogrenciAdi);
    let student = await prisma.student.findFirst({ where: { normalizedName: normOgrenci, organizationId } });
    if (!student) {
      student = await prisma.student.create({
        data: { adSoyad: row.ogrenciAdi.trim(), normalizedName: normOgrenci, organizationId },
      });
    }

    // Öğretmen bul veya oluştur
    const normOgretmen = normalizeName(row.ogretmenAdi);
    let staff = await prisma.staff.findFirst({ where: { normalizedName: normOgretmen, organizationId } });
    if (!staff) {
      staff = await prisma.staff.create({
        data: { adSoyad: row.ogretmenAdi.trim(), normalizedName: normOgretmen, organizationId },
      });
    }

    const { normalized: derslikNorm, bkdsRequired } = normalizeDerslik(row.derslik);
    const baslangic = parseTarihSaat(row.tarih, row.baslangicSaati);
    const bitis = parseTarihSaat(row.tarih, row.bitisSaati);
    const tarihDate = new Date(baslangic);
    tarihDate.setHours(0, 0, 0, 0);

    // LessonSession — duplicate önle
    const existing = await prisma.lessonSession.findFirst({
      where: { studentId: student.id, staffId: staff.id, baslangic, bitis, organizationId },
    });
    if (!existing) {
      await prisma.lessonSession.create({
        data: {
          studentId: student.id,
          staffId: staff.id,
          tarih: tarihDate,
          baslangic,
          bitis,
          derslik: derslikNorm,
          bkdsRequired,
          importJobId,
          organizationId,
        },
      });
    }

    // StaffSession — her öğretmen+tarih+saat kombinasyonu için 1 kayıt
    const existingStaff = await prisma.staffSession.findFirst({
      where: { staffId: staff.id, baslangic, bitis, organizationId },
    });
    if (!existingStaff) {
      await prisma.staffSession.create({
        data: {
          staffId: staff.id,
          tarih: tarihDate,
          baslangic,
          bitis,
          derslik: derslikNorm,
          organizationId,
        },
      });
    }
  }
}

export const lilaImportService = new LilaImportService();
