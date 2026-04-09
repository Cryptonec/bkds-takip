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

    // Öğrenci ve personeli önbelleğe al
    const studentCache = new Map<string, { id: string }>();
    const staffCache   = new Map<string, { id: string }>();

    const [existingStudents, existingStaff] = await Promise.all([
      prisma.student.findMany({ where: { organizationId }, select: { id: true, normalizedName: true } }),
      prisma.staff.findMany({   where: { organizationId }, select: { id: true, normalizedName: true } }),
    ]);
    existingStudents.forEach(s => studentCache.set(s.normalizedName, s));
    existingStaff.forEach(s => staffCache.set(s.normalizedName, s));

    // Import'taki tarihleri belirle — lessonSession ve staffSession cache'i önceden yükle
    const uniqueTarihler = [...new Set(rows.map(r => r.tarih))].map(t => {
      const d = new Date(t + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const [existingLessons, existingStaffSessions] = await Promise.all([
      prisma.lessonSession.findMany({
        where: { tarih: { in: uniqueTarihler }, organizationId },
        select: { studentId: true, staffId: true, baslangic: true, bitis: true },
      }),
      prisma.staffSession.findMany({
        where: { tarih: { in: uniqueTarihler }, organizationId },
        select: { staffId: true, baslangic: true, bitis: true },
      }),
    ]);

    // Set ile hızlı duplicate kontrolü
    const lessonSet = new Set(
      existingLessons.map(l => `${l.studentId}|${l.staffId}|${l.baslangic.getTime()}|${l.bitis.getTime()}`)
    );
    const staffSessSet = new Set(
      existingStaffSessions.map(s => `${s.staffId}|${s.baslangic.getTime()}|${s.bitis.getTime()}`)
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.processRow(row, importJobId, organizationId, studentCache, staffCache, lessonSet, staffSessSet);
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

  private async processRow(
    row: LilaImportRow,
    importJobId: string,
    organizationId: string,
    studentCache: Map<string, { id: string }>,
    staffCache: Map<string, { id: string }>,
    lessonSet: Set<string>,
    staffSessSet: Set<string>,
  ): Promise<void> {
    // Öğrenci bul veya oluştur (önbellekten)
    const normOgrenci = normalizeName(row.ogrenciAdi);
    let student = studentCache.get(normOgrenci);
    if (!student) {
      student = await prisma.student.create({
        data: { adSoyad: row.ogrenciAdi.trim(), normalizedName: normOgrenci, organizationId },
      });
      studentCache.set(normOgrenci, student);
    }

    // Öğretmen bul veya oluştur (önbellekten)
    const normOgretmen = normalizeName(row.ogretmenAdi);
    let staff = staffCache.get(normOgretmen);
    if (!staff) {
      staff = await prisma.staff.create({
        data: { adSoyad: row.ogretmenAdi.trim(), normalizedName: normOgretmen, organizationId },
      });
      staffCache.set(normOgretmen, staff);
    }

    const { normalized: derslikNorm, bkdsRequired } = normalizeDerslik(row.derslik);
    const baslangic = parseTarihSaat(row.tarih, row.baslangicSaati);
    const bitis = parseTarihSaat(row.tarih, row.bitisSaati);
    const tarihDate = new Date(baslangic);
    tarihDate.setHours(0, 0, 0, 0);

    // LessonSession — Set ile hızlı duplicate kontrolü (findFirst yerine)
    const lKey = `${student.id}|${staff.id}|${baslangic.getTime()}|${bitis.getTime()}`;
    if (!lessonSet.has(lKey)) {
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
      lessonSet.add(lKey);
    }

    // StaffSession — Set ile hızlı duplicate kontrolü
    const sKey = `${staff.id}|${baslangic.getTime()}|${bitis.getTime()}`;
    if (!staffSessSet.has(sKey)) {
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
      staffSessSet.add(sKey);
    }
  }
}

export const lilaImportService = new LilaImportService();
