import { PrismaClient } from '@prisma/client';
import { matchMaskedName } from '../src/lib/utils/normalize';

const prisma = new PrismaClient();

// BKDS'den gelen maskeli personel isimleri (konsoldan aldık)
const bkdsPersonel = [
  'BAT********REL',
  'ÖME********CAN',
  'NEC*********GÜN',
  'YUN*********OYU',
  'SEL******LAN',
  'SÜM*******TİN',
  'GAM****ÜRK',
  'MER*****DOĞ',
  'GÖN*******MİR',
  'MEL*****KAL',
  'ELİ*****ECİ',
  'KÜB*****KİN',
  'HAV*******UCA',
  'REC******DIZ',
  'SEH************DIZ',
  'AHM**********EKE',
  'NEJ********CAK',
];

async function main() {
  const allStaff = await prisma.staff.findMany({ where: { aktif: true } });

  console.log('\n=== BKDS Personel Eşleştirme ===\n');
  for (const masked of bkdsPersonel) {
    const match = allStaff.find(s => matchMaskedName(masked, s.adSoyad));
    if (match) {
      console.log(`✓ ${masked} → ${match.adSoyad}`);
    } else {
      console.log(`✗ ${masked} → EŞLEŞMEDİ`);
      // En yakın adayları göster
      const candidates = allStaff
        .map(s => ({ s, prefix: s.adSoyad.replace(/\s/g,'').substring(0,3).toUpperCase() }))
        .filter(({ prefix }) => masked.startsWith(prefix) || masked.substring(0,3) === prefix)
        .map(({ s }) => s.adSoyad);
      if (candidates.length) console.log(`   Aday: ${candidates.join(', ')}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
