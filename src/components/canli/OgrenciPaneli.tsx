'use client';
import { useState, memo, useMemo } from 'react';
import { formatTime } from '@/lib/utils';
import type { OgrenciRow } from '@/lib/hooks/useLiveAttendance';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, CheckCircle2, Shield, ChevronDown, ChevronUp, UserCheck,
  LogOut, Trash2,
} from 'lucide-react';
import { LEGEND_MAP } from './ColorLegend';

function getZamanGrubu(row: OgrenciRow, now: Date): 'gecmis' | 'aktif' | 'yaklasan_40' | 'yaklasan_60' | 'sonra' {
  if (row.status === 'bkds_muaf') return 'sonra';
  const baslangic = new Date(row.baslangic);
  const bitis = new Date(row.bitis);
  const dakikaKaldi = (baslangic.getTime() - now.getTime()) / 60000;
  if (now.getTime() > bitis.getTime() + 30 * 60 * 1000) return 'gecmis';
  if (dakikaKaldi <= 0) return 'aktif';
  if (dakikaKaldi <= 40) return 'yaklasan_40';
  if (dakikaKaldi <= 60) return 'yaklasan_60';
  return 'sonra';
}

/** Saat bucket'ına göre grupla: 13:00-13:59 → "13:00" etiketi */
function saatBucket(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

function groupBySaat(rows: OgrenciRow[], now: Date) {
  const zamanOrder: Record<string, number> = {
    aktif: 0, yaklasan_40: 1, yaklasan_60: 2, sonra: 3, gecmis: 4,
  };
  const muaflar = rows.filter(r => r.status === 'bkds_muaf');
  const diger = rows.filter(r => r.status !== 'bkds_muaf');

  const saatMap = new Map<string, OgrenciRow[]>();
  for (const row of diger) {
    const bucket = saatBucket(new Date(row.baslangic));
    const existing = saatMap.get(bucket) ?? [];
    existing.push(row);
    saatMap.set(bucket, existing);
  }

  const statusOrder: Record<string, number> = {
    kritik: 0, giris_eksik: 1, erken_cikis: 2, cikis_eksik: 3,
    gecikiyor: 4, gec_geldi: 5, derste: 6, giris_tamam: 6,
    bekleniyor: 7, tamamlandi: 8,
  };

  const saatGruplari = Array.from(saatMap.entries()).map(([saat, satirlar]) => {
    const zamanlar = satirlar.map(r => getZamanGrubu(r, now));
    const enOnce = zamanlar.reduce((a, b) => zamanOrder[a] <= zamanOrder[b] ? a : b, zamanlar[0]);
    satirlar.sort((a, b) => {
      const ta = new Date(a.baslangic).getTime();
      const tb = new Date(b.baslangic).getTime();
      if (ta !== tb) return ta - tb;
      const sd = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      return sd !== 0 ? sd : a.ogrenciAdi.localeCompare(b.ogrenciAdi, 'tr');
    });
    return { saat, satirlar, zamanGrubu: enOnce };
  });

  // Kesin kronolojik sira: en erken ders en uste, en gec en alta.
  // (Eskiden 'aktif' grubu ustte tutuluyordu; kullanici sira karistirmasin diye
  // istedi.)
  saatGruplari.sort((a, b) => {
    const aTime = new Date(a.satirlar[0].baslangic).getTime();
    const bTime = new Date(b.satirlar[0].baslangic).getTime();
    return aTime - bTime;
  });

  return { saatGruplari, muaflar };
}

/* ─── Kart stilleri: tek kaynak LEGEND_MAP ─────────────────────────────── */

type CardStyle = {
  cardBg: string;     // tüm kart bg
  textOnCard: string; // yazı kontrastı (text-white / text-yellow-900)
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  symbol: string;
};

function getCardStyle(row: OgrenciRow): CardStyle {
  const map = LEGEND_MAP();
  const hasGiris = !!row.gercekGiris;
  // Status yoksa veya bilinmiyorsa, giriş varsa "derste", yoksa "bekleniyor"
  const key = map[row.status] ? row.status : hasGiris ? 'derste' : 'bekleniyor';
  const item = map[key];
  return {
    cardBg: item.colorClass,
    textOnCard: item.textOnCard,
    label: row.statusLabel || item.label,
    icon: item.icon,
    symbol: item.symbol,
  };
}

/* ─── Saat başlığı stilleri ────────────────────────────────────────────── */

const ZAMAN_STIL: Record<string, { bar: string; badge: string; pingAnim: boolean; label: string }> = {
  aktif:       { bar: 'from-red-500 to-red-600 text-white',       badge: 'bg-white text-red-700',        pingAnim: true,  label: 'Şu An' },
  yaklasan_40: { bar: 'from-yellow-400 to-yellow-500 text-white', badge: 'bg-white text-yellow-700',     pingAnim: false, label: '40 dk İçinde' },
  yaklasan_60: { bar: 'from-blue-400 to-blue-500 text-white',     badge: 'bg-white text-blue-700',       pingAnim: false, label: '1 Saat İçinde' },
  sonra:       { bar: 'from-gray-200 to-gray-300 text-gray-700',  badge: 'bg-white text-gray-700',       pingAnim: false, label: 'Sonraki' },
  gecmis:      { bar: 'from-gray-100 to-gray-200 text-gray-500',  badge: 'bg-white text-gray-500',       pingAnim: false, label: 'Geçmiş' },
};

/* ─── Ana panel ────────────────────────────────────────────────────────── */

interface OgrenciPaneliProps {
  rows: OgrenciRow[];
  filter?: string;
  colorblind?: boolean;
  onDelete?: (lessonSessionId: string, ogrenciAdi: string) => void;
}

function OgrenciPaneliInner({ rows, filter, colorblind = false, onDelete }: OgrenciPaneliProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ muaf: true });

  const filtered = useMemo(
    () => (filter && filter !== 'hepsi' ? rows.filter(r => r.status === filter) : rows),
    [rows, filter],
  );
  // now sadece veri her degistiginde yeniden hesaplanir; tum saniyelik
  // re-render'larda degil. saat-bucket'lari ve sirayi etkileyen ana faktor
  // burada degisken degil.
  const { saatGruplari, muaflar } = useMemo(
    () => groupBySaat(filtered, new Date()),
    [filtered],
  );

  if (filtered.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Bu kategoride kayıt yok</div>;
  }

  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div>

      {/* Saat saat kart grupları */}
      <div>
        {saatGruplari.map(({ saat, satirlar, zamanGrubu }) => {
          const stil = ZAMAN_STIL[zamanGrubu];
          const key = `saat-${saat}`;
          const isOpen = !(collapsed[key] ?? false);
          const sorunlu = satirlar.filter(r => ['kritik','giris_eksik','gecikiyor','erken_cikis'].includes(r.status)).length;
          const tamam = satirlar.filter(r => ['tamamlandi','derste','giris_tamam'].includes(r.status)).length;

          return (
            <section key={key} className="border-t-4 border-gray-100 first:border-t-0">
              {/* Saat başlığı — net ayırım için kalın renkli band */}
              <button
                onClick={() => toggle(key)}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:brightness-95',
                  'bg-gradient-to-r shadow-sm',
                  stil.bar,
                )}
              >
                <span className="relative flex h-3 w-3 shrink-0">
                  {stil.pingAnim && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />}
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white opacity-90" />
                </span>
                <span className="text-2xl font-black tabular-nums tracking-tight">{saat}</span>
                <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm', stil.badge)}>
                  {stil.label}
                </span>
                <span className="text-sm font-semibold opacity-90">{satirlar.length} ders</span>
                {sorunlu > 0 && (
                  <span className="flex items-center gap-1 bg-black/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" />{sorunlu} sorun
                  </span>
                )}
                {tamam > 0 && (
                  <span className="flex items-center gap-1 bg-black/25 text-white text-xs px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />{tamam} tamam
                  </span>
                )}
                <span className="ml-auto opacity-80">
                  {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </span>
              </button>

              {isOpen && (
                <div className="p-3 bg-gray-50">
                  <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {satirlar.map(row => (
                      <OgrenciKart
                        key={row.id}
                        row={row}
                        colorblind={colorblind}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {/* BKDS Muaf */}
        {muaflar.length > 0 && (
          <section className="border-t-4 border-gray-100">
            <button onClick={() => toggle('muaf')}
              className="w-full flex items-center gap-3 px-5 py-3 text-left bg-blue-50 hover:bg-blue-100 transition-colors">
              <Shield className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-lg font-bold text-blue-700">Evde Destek Eğitim</span>
              <span className="text-xs bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">
                BKDS Muaf · {muaflar.length}
              </span>
              <span className="ml-auto text-blue-400">
                {collapsed['muaf'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </span>
            </button>
            {!collapsed['muaf'] && (
              <div className="p-3 bg-gray-50 opacity-80">
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {muaflar.map(row => (
                    <OgrenciKart
                      key={row.id}
                      row={row}
                      colorblind={colorblind}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// Üst seviye memo — props (rows, filter, colorblind, onDelete) reference olarak
// degismediginde yeniden render olmaz. data icerigi degismediginde rows ayni
// referansta kalir (dataEsdeger). lastUpdated saniyelik degisse bile bu pano
// yeniden render edilmez → "F5 etkisi" ortadan kalkar.
export const OgrenciPaneli = memo(OgrenciPaneliInner);

/* ─── Tek kart ─────────────────────────────────────────────────────────── */

const OgrenciKart = memo(function OgrenciKart({
  row, colorblind, onDelete,
}: {
  row: OgrenciRow;
  colorblind: boolean;
  onDelete?: (lessonSessionId: string, ogrenciAdi: string) => void;
}) {
  const stil = getCardStyle(row);
  const Icon = stil.icon;
  const girisYapti = !!row.gercekGiris;
  const [confirmSil, setConfirmSil] = useState(false);

  return (
    <div className={cn(
      'relative rounded-xl shadow-sm overflow-hidden group flex flex-col',
      stil.cardBg,
      stil.textOnCard,
      colorblind && 'ring-2 ring-black/40',
      girisYapti && 'ring-2 ring-emerald-400 ring-offset-1',
      row.status === 'kritik' && 'animate-blink',
    )}>
      {/* Üst şerit: durum ikonu + etiketi (kart renginin üzerine siyah katman) */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-black/20">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{stil.label}</span>
        {colorblind && (
          <span className="ml-1 font-black opacity-90">{stil.symbol}</span>
        )}
        {row.gelmediUyari && !confirmSil && (
          <AlertTriangle className="w-3.5 h-3.5 ml-auto animate-pulse" />
        )}
        {onDelete && !confirmSil && (
          <button
            onClick={() => setConfirmSil(true)}
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/30 rounded p-0.5"
            title="Dersi sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {onDelete && confirmSil && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                onDelete(row.lessonSessionId, row.ogrenciAdi);
                setConfirmSil(false);
              }}
              className="text-[10px] font-bold bg-white text-red-700 hover:bg-red-50 px-1.5 py-0.5 rounded"
              title="Silmeyi onayla"
            >
              Sil
            </button>
            <button
              onClick={() => setConfirmSil(false)}
              className="text-[10px] font-bold bg-black/30 hover:bg-black/50 px-1.5 py-0.5 rounded"
              title="İptal"
            >
              İptal
            </button>
          </div>
        )}
      </div>

      {/* Gövde */}
      <div className="flex-1 px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
        <p className="font-bold text-sm uppercase tracking-tight leading-tight truncate" title={row.ogrenciAdi}>
          {row.ogrenciAdi}
        </p>
      </div>

      {/* Alt: gerçek giriş/çıkış (ders saat aralığı kart başlığında zaten saat-bucket'inda gösteriliyor) */}
      <div className="px-3 py-1.5 bg-black/25 text-[11px] font-semibold flex items-center gap-3 flex-wrap">
        {row.gercekGiris ? (
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <UserCheck className="w-3 h-3" />
            {formatTime(row.gercekGiris)}
          </span>
        ) : (
          <span className="text-white/60">—</span>
        )}
        {row.gercekCikis && (
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <LogOut className="w-3 h-3" />
            {formatTime(row.gercekCikis)}
          </span>
        )}
      </div>
    </div>
  );
});

/* ─── Durum filtre bar ─────────────────────────────────────────────────── */

const STATUS_GROUPS = [
  { key: 'kritik',      label: 'Kritik',       color: 'bg-red-600' },
  { key: 'giris_eksik', label: 'Giriş Eksik',  color: 'bg-orange-500' },
  { key: 'erken_cikis', label: 'Erken Çıkış',  color: 'bg-purple-500' },
  { key: 'cikis_eksik', label: 'Çıkış Eksik',  color: 'bg-orange-400' },
  { key: 'gecikiyor',   label: 'Gecikiyor',     color: 'bg-yellow-500' },
  { key: 'gec_geldi',   label: 'Geç Geldi',     color: 'bg-amber-400' },
  { key: 'derste',      label: 'Derste',         color: 'bg-green-500' },
  { key: 'giris_tamam', label: 'Derste',         color: 'bg-green-500' },
  { key: 'bekleniyor',  label: 'Bekleniyor',    color: 'bg-gray-400' },
  { key: 'tamamlandi',  label: 'Tamamlandı',    color: 'bg-green-600' },
  { key: 'bkds_muaf',   label: 'BKDS Muaf',     color: 'bg-blue-500' },
];

interface StatusSummaryBarProps {
  counts: Record<string, number>;
  activeFilter: string;
  onFilter: (key: string) => void;
}

export const StatusSummaryBar = memo(function StatusSummaryBar({ counts, activeFilter, onFilter }: StatusSummaryBarProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-gray-100 bg-white">
      <button onClick={() => onFilter('hepsi')}
        className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
          activeFilter === 'hepsi' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
        )}>Hepsi ({total})</button>
      {STATUS_GROUPS.filter(g => (counts[g.key] ?? 0) > 0).map(g => (
        <button key={g.key} onClick={() => onFilter(g.key)}
          className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
            activeFilter === g.key ? `${g.color} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          )}>
          {g.label} ({counts[g.key] ?? 0})
        </button>
      ))}
    </div>
  );
});
