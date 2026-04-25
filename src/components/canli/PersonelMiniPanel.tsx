'use client';
import { useState, useMemo } from 'react';
import { formatTime } from '@/lib/utils';
import type { PersonelRow, PersonelGiris } from '@/lib/hooks/useLiveAttendance';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, UserCheck, LogOut, Users } from 'lucide-react';

interface Props {
  rows: PersonelRow[];
  tumPersonelGirisler: PersonelGiris[];
}

interface MiniPersonel {
  staffId: string;
  ogretmenAdi: string;
  ilkGiris: string | null;
  sonCikis: string | null;
  dersVar: boolean;
  status: string;
}

function birlestir(rows: PersonelRow[], tumPersonel: PersonelGiris[]): MiniPersonel[] {
  const map = new Map<string, MiniPersonel>();

  for (const row of rows) {
    const giris = (row as any).baslamaZamani ?? null;
    const cikis = (row as any).sonCikisZamani ?? null;
    const existing = map.get(row.staffId);
    if (!existing) {
      map.set(row.staffId, {
        staffId: row.staffId,
        ogretmenAdi: row.ogretmenAdi,
        ilkGiris: giris,
        sonCikis: cikis,
        dersVar: true,
        status: row.status,
      });
    } else {
      if (giris && (!existing.ilkGiris || new Date(giris) < new Date(existing.ilkGiris))) existing.ilkGiris = giris;
      if (cikis && (!existing.sonCikis || new Date(cikis) > new Date(existing.sonCikis))) existing.sonCikis = cikis;
    }
  }

  for (const p of tumPersonel) {
    const key = p.staffId ?? p.ogretmenAdi;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        staffId: key,
        ogretmenAdi: p.ogretmenAdi,
        ilkGiris: p.ilkGiris ? new Date(p.ilkGiris).toISOString() : null,
        sonCikis: p.sonCikis ? new Date(p.sonCikis).toISOString() : null,
        dersVar: false,
        status: 'derste',
      });
    } else {
      if (p.ilkGiris && !existing.ilkGiris) existing.ilkGiris = new Date(p.ilkGiris).toISOString();
      if (p.sonCikis && !existing.sonCikis) existing.sonCikis = new Date(p.sonCikis).toISOString();
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Önce girişi olanlar, sonra giriş zamanına göre
    if (!!a.ilkGiris !== !!b.ilkGiris) return a.ilkGiris ? -1 : 1;
    if (a.ilkGiris && b.ilkGiris) return new Date(b.ilkGiris).getTime() - new Date(a.ilkGiris).getTime();
    return a.ogretmenAdi.localeCompare(b.ogretmenAdi, 'tr');
  });
}

/**
 * Öğrenci takibi sayfasında üstte gösterilen kompakt personel
 * giriş/çıkış paneli. Tek bakışta öğretmen ve diğer personelin durumunu
 * gösterir, detay için /canli > Personel sekmesi var.
 */
export function PersonelMiniPanel({ rows, tumPersonelGirisler }: Props) {
  const [open, setOpen] = useState(true);
  const personeller = useMemo(() => birlestir(rows, tumPersonelGirisler), [rows, tumPersonelGirisler]);

  const kurumda = personeller.filter(p => p.ilkGiris && !p.sonCikis).length;
  const cikti = personeller.filter(p => p.ilkGiris && p.sonCikis).length;
  const gelmemis = personeller.filter(p => !p.ilkGiris).length;

  if (personeller.length === 0) return null;

  return (
    <div className="border-b border-gray-200 bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-gray-50 transition-colors"
      >
        <Users className="w-4 h-4 text-indigo-600 shrink-0" />
        <span className="font-semibold text-gray-800">Personel Giriş / Çıkış</span>
        <div className="flex items-center gap-3 text-xs">
          {kurumda > 0 && (
            <span className="flex items-center gap-1 text-green-700 font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-500" /> {kurumda} kurumda
            </span>
          )}
          {cikti > 0 && (
            <span className="flex items-center gap-1 text-orange-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> {cikti} çıktı
            </span>
          )}
          {gelmemis > 0 && (
            <span className="flex items-center gap-1 text-gray-500 font-semibold">
              <span className="w-2 h-2 rounded-full bg-gray-300" /> {gelmemis} bekleniyor
            </span>
          )}
        </div>
        <span className="ml-auto text-gray-400">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 max-h-44 overflow-y-auto">
          <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {personeller.map(p => (
              <PersonelMiniKart key={p.staffId} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonelMiniKart({ p }: { p: MiniPersonel }) {
  const inside = !!p.ilkGiris && !p.sonCikis;
  const left = !!p.ilkGiris && !!p.sonCikis;
  const waiting = !p.ilkGiris;

  return (
    <div className={cn(
      'flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border text-xs',
      inside && 'bg-green-50 border-green-200',
      left && 'bg-orange-50 border-orange-200',
      waiting && 'bg-gray-50 border-gray-200',
    )}>
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-semibold text-gray-800 truncate" title={p.ogretmenAdi}>
          {p.ogretmenAdi}
        </span>
        {!p.dersVar && (
          <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 rounded shrink-0">
            DERSSIZ
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 tabular-nums text-[11px]">
        {p.ilkGiris ? (
          <span className="inline-flex items-center gap-0.5 text-green-700 font-bold">
            <UserCheck className="w-3 h-3" /> {formatTime(p.ilkGiris)}
          </span>
        ) : (
          <span className="text-gray-400">— bekleniyor</span>
        )}
        {p.sonCikis && (
          <span className="inline-flex items-center gap-0.5 text-orange-600 font-bold">
            <LogOut className="w-3 h-3" /> {formatTime(p.sonCikis)}
          </span>
        )}
      </div>
    </div>
  );
}
