'use client';
import { formatTime } from '@/lib/utils';
import type { PersonelRow, PersonelGiris } from '@/lib/hooks/useLiveAttendance';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, UserCheck, LogOut, Info, Pencil, Check, X } from 'lucide-react';

interface PersonelPaneliProps {
  rows: PersonelRow[];
  tumPersonelGirisler: PersonelGiris[];
  onRefresh: () => void;
}

interface BirlesikPersonel {
  staffId: string;
  ogretmenAdi: string;
  ilkGiris: string | null;
  sonCikis: string | null;
  status: string;
  dersVar: boolean;
  tahmin?: string | null;
}

// StaffSession'larını ve BKDS log'larını birleştir
function birleştir(rows: PersonelRow[], tumPersonel: PersonelGiris[]): BirlesikPersonel[] {
  const map = new Map<string, BirlesikPersonel>();

  // Önce StaffSession'lardan gelen personeli işle
  for (const row of rows) {
    const existing = map.get(row.staffId);
    const giris = (row as any).baslamaZamani ?? null;
    const cikis = (row as any).sonCikisZamani ?? null;

    if (!existing) {
      map.set(row.staffId, {
        staffId: row.staffId,
        ogretmenAdi: row.ogretmenAdi,
        ilkGiris: giris,
        sonCikis: cikis,
        status: row.status,
        dersVar: true,
      });
    } else {
      const order: Record<string, number> = { gelmedi: 0, gecikiyor: 1, gec_basladi: 2, derste: 3, bekleniyor: 4 };
      if ((order[row.status] ?? 9) < (order[existing.status] ?? 9)) existing.status = row.status;
      if (giris && (!existing.ilkGiris || new Date(giris) < new Date(existing.ilkGiris))) existing.ilkGiris = giris;
      if (cikis && (!existing.sonCikis || new Date(cikis) > new Date(existing.sonCikis))) existing.sonCikis = cikis;
    }
  }

  // BKDS log'larından gelen ek personeli ekle (dersi olmayanlar)
  for (const p of tumPersonel) {
    const key = p.staffId ?? p.ogretmenAdi;
    const existing = map.get(key);

    if (!existing) {
      // Dersi yok ama bugün kuruma gelmiş
      map.set(key, {
        staffId: key,
        ogretmenAdi: p.ogretmenAdi,
        ilkGiris: p.ilkGiris ? new Date(p.ilkGiris).toISOString() : null,
        sonCikis: p.sonCikis ? new Date(p.sonCikis).toISOString() : null,
        status: 'derste', // gelmiş = derste sayıyoruz
        dersVar: false,
        tahmin: p.eslesmeDurumu === 'prefix_eslesme' ? p.tahmin : null,
      });
    } else {
      // Giriş bilgisini güncelle (BKDS'den daha kesin)
      if (p.ilkGiris && !existing.ilkGiris) {
        existing.ilkGiris = new Date(p.ilkGiris).toISOString();
      }
      if (p.sonCikis && !existing.sonCikis) {
        existing.sonCikis = new Date(p.sonCikis).toISOString();
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.ogretmenAdi.localeCompare(b.ogretmenAdi, 'tr'));
}

const GRUP_STIL: Record<string, { label: string; header: string; row: string }> = {
  gelmedi:     { label: 'Gelmedi',          header: 'bg-red-600 text-white',     row: 'bg-red-50/40' },
  gecikiyor:   { label: 'Gecikiyor',        header: 'bg-yellow-500 text-white',  row: 'bg-yellow-50/30' },
  gec_basladi: { label: 'Geç Başladı',      header: 'bg-amber-500 text-white',   row: 'bg-amber-50/20' },
  derste:      { label: 'Kurumda / Derste', header: 'bg-green-600 text-white',   row: 'bg-green-50/10' },
  bekleniyor:  { label: 'Bekleniyor',       header: 'bg-gray-200 text-gray-700', row: '' },
};

const STATUS_GRUP_SIRA = ['gelmedi', 'gecikiyor', 'gec_basladi', 'derste', 'bekleniyor'];

export function PersonelPaneli({ rows, tumPersonelGirisler, onRefresh }: PersonelPaneliProps) {
  const birlesik = birleştir(rows, tumPersonelGirisler);

  if (birlesik.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Bugün için personel kaydı yok</div>;
  }

  const gruplar: Record<string, BirlesikPersonel[]> = {};
  for (const p of birlesik) {
    const g = gruplar[p.status] ?? [];
    g.push(p);
    gruplar[p.status] = g;
  }

  const kurumda = birlesik.filter(p => ['derste', 'gec_basladi'].includes(p.status)).length;
  const sorunlu = birlesik.filter(p => ['gelmedi', 'gecikiyor'].includes(p.status)).length;

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50 text-sm">
        <span className="text-gray-500 font-medium">{birlesik.length} personel</span>
        {kurumda > 0 && (
          <span className="flex items-center gap-1.5 text-green-600 font-semibold">
            <CheckCircle2 className="w-4 h-4" />{kurumda} kurumda
          </span>
        )}
        {sorunlu > 0 && (
          <span className="flex items-center gap-1.5 text-red-600 font-semibold">
            <AlertTriangle className="w-4 h-4" />{sorunlu} sorunlu
          </span>
        )}
      </div>

      {STATUS_GRUP_SIRA.map(status => {
        const satirlar = gruplar[status];
        if (!satirlar || satirlar.length === 0) return null;
        const stil = GRUP_STIL[status] ?? GRUP_STIL.bekleniyor;

        return (
          <div key={status} className="border-b border-gray-100 last:border-0">
            <div className={cn('px-5 py-2 text-xs font-bold uppercase tracking-wider', stil.header)}>
              {stil.label} ({satirlar.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide">Personel</th>
                  <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide">İlk Giriş</th>
                  <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide">Son Çıkış</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {satirlar.map(p => (
                  <tr key={p.staffId} className={cn('hover:bg-gray-50 transition-colors', stil.row)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <PersonelIsim staffId={p.staffId} ogretmenAdi={p.ogretmenAdi} />
                        {!p.dersVar && (
                          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full">
                            Derssiz Gün
                          </span>
                        )}
                        {p.tahmin && (
                          <span title={`Soyisim değişikliği tahmini: ${p.tahmin}`}
                            className="text-xs text-orange-500 cursor-help">
                            <Info className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-3 w-36 tabular-nums">
                      {p.ilkGiris ? (
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <span className="text-green-700 font-bold">{formatTime(p.ilkGiris)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    <td className="px-5 py-3 w-36 tabular-nums">
                      {p.sonCikis ? (
                        <div className="flex items-center gap-1.5">
                          <LogOut className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="text-orange-500 font-bold">{formatTime(p.sonCikis)}</span>
                        </div>
                      ) : p.ilkGiris ? (
                        <span className="text-xs text-green-500 italic">Devam ediyor</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// localStorage key sabit — staffId + masked prefix ile benzersiz
function getStorageKey(staffId: string, masked: string) {
  return `pname_${staffId}_${masked.substring(0, 4)}`;
}

function PersonelIsim({ staffId, ogretmenAdi }: { staffId: string; ogretmenAdi: string }) {
  const isMasked = ogretmenAdi.includes('*');
  const storageKey = getStorageKey(staffId, ogretmenAdi);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [savedName, setSavedName] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
  );

  function handleSave() {
    const trimmed = value.trim().toLocaleUpperCase('tr-TR');
    if (!trimmed) return;
    localStorage.setItem(storageKey, trimmed);
    setSavedName(trimmed);
    setEditing(false);
    setValue('');
  }

  if (!isMasked) {
    return <p className="font-semibold text-gray-900">{ogretmenAdi}</p>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value.toLocaleUpperCase('tr-TR'))}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="GERÇEK İSMİ YAZ (BÜYÜK HARF)"
          className="border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          style={{ textTransform: 'uppercase' }}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-800">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={() => { setEditing(false); setValue(''); }} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const displayName = savedName ?? null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {displayName ? (
        <p className="font-semibold text-gray-900">{displayName}</p>
      ) : (
        <span className="text-xs bg-orange-100 text-orange-700 border border-orange-300 px-2 py-0.5 rounded-full italic">
          Tanımlanamayan ({ogretmenAdi.charAt(0)}.)
        </span>
      )}
      <button
        onClick={() => { setValue(savedName ?? ''); setEditing(true); }}
        className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded-lg transition-colors"
        title={savedName ? 'Soyadı değişikliği varsa düzenle' : 'İsim gir'}
      >
        <Pencil className="w-3 h-3" /> {savedName ? 'Düzenle' : 'İsim Gir'}
      </button>
    </div>
  );
}
