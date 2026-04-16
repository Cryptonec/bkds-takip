'use client';
import { useState, useRef } from 'react';
import { useLiveAttendance } from '@/lib/hooks/useLiveAttendance';
import { BildirimPanel } from '@/components/canli/BildirimPanel';
import {
  RefreshCw, Wifi, WifiOff, UserCheck, LogOut, GraduationCap,
  CheckCircle2, XCircle, PlayCircle, Timer, Clock, AlertTriangle,
  CalendarDays, AlertCircle,
} from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { OgrenciRow } from '@/lib/hooks/useLiveAttendance';

// ──────────────────────────────────────────────
// Gerçek DB statüsü → renk/ikon/etiket paleti
// ──────────────────────────────────────────────
type DbStatus =
  | 'bekleniyor' | 'gecikiyor' | 'giris_eksik' | 'kritik'
  | 'gec_geldi' | 'giris_tamam' | 'derste'
  | 'cikis_eksik' | 'erken_cikis' | 'tamamlandi' | 'bkds_muaf';

const STATUS_STYLE: Record<DbStatus, {
  bg: string; text: string; border: string;
  icon: React.ReactNode; label: string; badgeBg: string;
}> = {
  tamamlandi: {
    bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700',
    icon: <CheckCircle2 className="w-4 h-4" />, label: 'Tamamlandı', badgeBg: 'bg-blue-700',
  },
  derste: {
    bg: 'bg-sky-600', text: 'text-white', border: 'border-sky-700',
    icon: <PlayCircle className="w-4 h-4" />, label: 'Derste', badgeBg: 'bg-sky-700',
  },
  giris_tamam: {
    bg: 'bg-sky-600', text: 'text-white', border: 'border-sky-700',
    icon: <PlayCircle className="w-4 h-4" />, label: 'Derste', badgeBg: 'bg-sky-700',
  },
  gec_geldi: {
    bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600',
    icon: <Timer className="w-4 h-4" />, label: 'Geç Geldi', badgeBg: 'bg-orange-600',
  },
  erken_cikis: {
    bg: 'bg-violet-600', text: 'text-white', border: 'border-violet-700',
    icon: <LogOut className="w-4 h-4" />, label: 'Erken Çıkış', badgeBg: 'bg-violet-700',
  },
  bekleniyor: {
    bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-600',
    icon: <Clock className="w-4 h-4" />, label: 'Planlandı', badgeBg: 'bg-slate-600',
  },
  gecikiyor: {
    bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600',
    icon: <AlertCircle className="w-4 h-4" />, label: 'Gecikiyor', badgeBg: 'bg-yellow-600',
  },
  giris_eksik: {
    bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-600',
    icon: <AlertTriangle className="w-4 h-4" />, label: 'Giriş Eksik', badgeBg: 'bg-rose-600',
  },
  kritik: {
    bg: 'bg-rose-700', text: 'text-white', border: 'border-rose-800',
    icon: <XCircle className="w-4 h-4" />, label: 'Kritik!', badgeBg: 'bg-rose-800',
  },
  cikis_eksik: {
    bg: 'bg-amber-600', text: 'text-white', border: 'border-amber-700',
    icon: <AlertCircle className="w-4 h-4" />, label: 'Çıkış Eksik', badgeBg: 'bg-amber-700',
  },
  bkds_muaf: {
    bg: 'bg-slate-400', text: 'text-white', border: 'border-slate-500',
    icon: <CheckCircle2 className="w-4 h-4" />, label: 'BKDS Muaf', badgeBg: 'bg-slate-500',
  },
};

const DEFAULT_STYLE = {
  bg: 'bg-slate-400', text: 'text-white', border: 'border-slate-500',
  icon: <Clock className="w-4 h-4" />, label: 'Bilinmiyor', badgeBg: 'bg-slate-500',
};

function getStyle(status: string) {
  return STATUS_STYLE[status as DbStatus] ?? DEFAULT_STYLE;
}

// ──────────────────────────────────────────────
// Filtre grupları
// ──────────────────────────────────────────────
const ABSENT_STATUSES = ['gecikiyor', 'giris_eksik', 'kritik'];

// ──────────────────────────────────────────────
// Öğrenci kartı
// ──────────────────────────────────────────────
function OgrenciKart({ row }: { row: OgrenciRow }) {
  const s = getStyle(row.status);
  const isCritical = row.status === 'kritik';

  return (
    <div className={cn(
      'relative flex flex-col rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md',
      s.bg, s.border, s.text,
      isCritical && 'animate-blink ring-2 ring-rose-300',
    )}>
      {/* Üst: ikon + etiket */}
      <div className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold', s.badgeBg)}>
        {s.icon}
        <span>{s.label}</span>
      </div>

      {/* Gövde */}
      <div className="px-3 py-2 flex-1">
        <p className="font-bold text-sm leading-tight truncate" title={row.ogrenciAdi}>
          {row.ogrenciAdi}
        </p>
        <p className="text-xs opacity-80 mt-0.5 truncate">{row.ogretmenAdi}</p>
        <p className="text-xs opacity-70 mt-0.5">{row.derslik}</p>
      </div>

      {/* Alt: saatler */}
      <div className="px-3 pb-2 text-xs opacity-90 flex items-center gap-2 flex-wrap">
        <span className="font-mono">{formatTime(row.baslangic)} – {formatTime(row.bitis)}</span>
        {row.gercekGiris && (
          <span className="flex items-center gap-0.5 ml-auto">
            <UserCheck className="w-3 h-3" />
            {formatTime(row.gercekGiris)}
          </span>
        )}
        {row.gercekCikis && (
          <span className="flex items-center gap-0.5">
            <LogOut className="w-3 h-3" />
            {formatTime(row.gercekCikis)}
          </span>
        )}
        {row.yaklasanUyari && !row.gercekGiris && (
          <span className="ml-auto bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded font-semibold">
            {row.dakikaKaldi}dk
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Legend
// ──────────────────────────────────────────────
const LEGEND: Array<{ status: DbStatus; show?: boolean }> = [
  { status: 'derste' },
  { status: 'gec_geldi' },
  { status: 'tamamlandi' },
  { status: 'erken_cikis' },
  { status: 'bekleniyor' },
  { status: 'gecikiyor' },
  { status: 'giris_eksik' },
  { status: 'kritik' },
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {LEGEND.map(({ status }) => {
        const s = STATUS_STYLE[status];
        return (
          <span key={status} className="flex items-center gap-1.5">
            <span className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', s.bg)}>
              {s.icon}
            </span>
            <span className="text-gray-600">{s.label}</span>
          </span>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Toast bildirimleri — sol alt
// ──────────────────────────────────────────────
function ToastStack({
  yeniGirisler, yeniCikislar, yeniPersonelGiris, yeniPersonelCikis,
}: {
  yeniGirisler: OgrenciRow[];
  yeniCikislar: OgrenciRow[];
  yeniPersonelGiris: Array<{ id: string; ad: string; derslik?: string }>;
  yeniPersonelCikis: Array<{ id: string; ad: string; derslik?: string }>;
}) {
  const items = [
    ...yeniGirisler.map(r => ({
      key: `og-${r.ogrenciId}`, icon: <UserCheck className="w-4 h-4" />,
      bg: 'bg-sky-600', text: r.ogrenciAdi, sub: `Öğrenci Girişi · ${r.derslik}`,
    })),
    ...yeniCikislar.map(r => ({
      key: `oc-${r.ogrenciId}`, icon: <LogOut className="w-4 h-4" />,
      bg: 'bg-violet-600', text: r.ogrenciAdi, sub: `Öğrenci Çıkışı · ${r.derslik}`,
    })),
    ...yeniPersonelGiris.map(p => ({
      key: `pg-${p.id}`, icon: <GraduationCap className="w-4 h-4" />,
      bg: 'bg-sky-700', text: p.ad, sub: `Derse Başladı${p.derslik ? ` · ${p.derslik}` : ''}`,
    })),
    ...yeniPersonelCikis.map(p => ({
      key: `pc-${p.id}`, icon: <LogOut className="w-4 h-4" />,
      bg: 'bg-orange-500', text: p.ad, sub: `Ders Tamamlandı${p.derslik ? ` · ${p.derslik}` : ''}`,
    })),
  ];
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map(item => (
        <div key={item.key} className={cn('flex items-center gap-3 text-white px-4 py-2.5 rounded-xl shadow-xl text-sm', item.bg)}>
          {item.icon}
          <div>
            <p className="font-bold leading-tight">{item.text}</p>
            <p className="text-xs opacity-80">{item.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Ana sayfa
// ──────────────────────────────────────────────
export default function ProgramPage() {
  const [filterStatus, setFilterStatus] = useState<string>('hepsi');

  // Sayfa açıldığı anda geçmiş bildirimleri göstermemek için
  // useLiveAttendance'ın isFirstFetch mekanizması yeterli —
  // yeniBildirimler sadece sayfa açıldıktan SONRA gelen yenileri içerir.
  const {
    data, loading, error, lastUpdated, refresh,
    yeniBildirimler, dismissBildirim,
    yeniGirisler, yeniCikislar,
    yeniPersonelGiris, yeniPersonelCikis,
  } = useLiveAttendance(undefined, 3000); // 3s — gerçek zamanlı BKDS sync

  const rows = data?.ogrenciRows ?? [];

  // Header sayaçları (sadece aktif, yani ders vakti gelmiş olanlar)
  const gelmediSayisi   = rows.filter(r => r.gelmediUyari).length;
  const gecikiyorSayisi = rows.filter(r => r.yaklasanUyari && !r.gercekGiris).length;
  const erkenCikisSayisi = rows.filter(r => r.erkenCikisUyari).length;

  // Filtre
  const filteredRows = filterStatus === 'hepsi'
    ? rows
    : filterStatus === 'gelmedi'
      ? rows.filter(r => ABSENT_STATUSES.includes(r.status))
      : rows.filter(r => r.status === filterStatus);

  const count = (s: string) =>
    s === 'gelmedi' ? rows.filter(r => ABSENT_STATUSES.includes(r.status)).length
    : rows.filter(r => r.status === s).length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <ToastStack
        yeniGirisler={yeniGirisler}
        yeniCikislar={yeniCikislar}
        yeniPersonelGiris={yeniPersonelGiris}
        yeniPersonelCikis={yeniPersonelCikis}
      />

      {/* Sayfa açıldıktan SONRA oluşan bildirimler burada çıkar */}
      <BildirimPanel bildirimler={yeniBildirimler} onDismiss={dismissBildirim} />

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 text-gray-800">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          <h1 className="font-bold text-base">Günlük Program</h1>
          {lastUpdated && (
            <span className="text-xs text-gray-400 tabular-nums">
              · {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {/* Canlı sayaçlar */}
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {gelmediSayisi > 0 && (
            <span className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 text-rose-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
              <XCircle className="w-3.5 h-3.5" />
              {gelmediSayisi} gelmedi
            </span>
          )}
          {gecikiyorSayisi > 0 && (
            <span className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-300 text-yellow-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
              <Clock className="w-3.5 h-3.5" />
              {gecikiyorSayisi} yaklaşıyor
            </span>
          )}
          {erkenCikisSayisi > 0 && (
            <span className="flex items-center gap-1.5 bg-violet-50 border border-violet-300 text-violet-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
              <LogOut className="w-3.5 h-3.5" />
              {erkenCikisSayisi} erken çıkış
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={cn(
            'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full font-medium',
            error ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50',
          )}>
            {error ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            {error ? 'Bağlantı Hatası' : 'Canlı · 3s'}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Filtre çubuğu ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        {[
          { key: 'hepsi',       label: `Tümü (${rows.length})` },
          { key: 'derste',      label: `Derste (${count('derste') + count('giris_tamam') + count('gec_geldi')})` },
          { key: 'gelmedi',     label: `Gelmedi (${count('gelmedi')})` },
          { key: 'erken_cikis', label: `Erken Çıkış (${count('erken_cikis')})` },
          { key: 'bekleniyor',  label: `Planlandı (${count('bekleniyor')})` },
          { key: 'tamamlandi',  label: `Tamamlandı (${count('tamamlandi')})` },
          { key: 'bkds_muaf',   label: `BKDS Muaf (${count('bkds_muaf')})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
              filterStatus === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Kart ızgarası ── */}
      <div className="flex-1 p-4 overflow-auto">
        {loading && !data && (
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}

        {data && filteredRows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Bu filtreye uygun kayıt yok</p>
          </div>
        )}

        {data && filteredRows.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {filteredRows
              .sort((a, b) => new Date(a.baslangic).getTime() - new Date(b.baslangic).getTime())
              .map(row => (
                <OgrenciKart key={row.id} row={row} />
              ))}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="bg-white border-t border-gray-200 px-6 py-2 shrink-0">
        <Legend />
      </div>
    </div>
  );
}
