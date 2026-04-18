'use client';
import { useState } from 'react';
import { formatTime } from '@/lib/utils';
import type { OgrenciRow } from '@/lib/hooks/useLiveAttendance';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Shield, ChevronDown, ChevronUp, UserCheck, Eye, EyeOff, LogOut, Trash2 } from 'lucide-react';
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

  // Saat bucket'ı üzerinden grupla (13:00-13:59 tek grup)
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

  saatGruplari.sort((a, b) => {
    const zd = zamanOrder[a.zamanGrubu] - zamanOrder[b.zamanGrubu];
    if (zd !== 0) return zd;
    const aTime = new Date(a.satirlar[0].baslangic).getTime();
    const bTime = new Date(b.satirlar[0].baslangic).getTime();
    return a.zamanGrubu === 'gecmis' ? bTime - aTime : aTime - bTime;
  });

  return { saatGruplari, muaflar };
}

const ZAMAN_STIL: Record<string, { dot: string; header: string; badge: string; pingAnim: boolean }> = {
  aktif:       { dot: 'bg-red-500',    header: 'bg-red-600 text-white',     badge: 'bg-red-700 text-white border-red-800',       pingAnim: true },
  yaklasan_40: { dot: 'bg-yellow-400', header: 'bg-yellow-500 text-white',  badge: 'bg-yellow-600 text-white border-yellow-700', pingAnim: false },
  yaklasan_60: { dot: 'bg-blue-400',   header: 'bg-blue-500 text-white',    badge: 'bg-blue-600 text-white border-blue-700',     pingAnim: false },
  sonra:       { dot: 'bg-gray-300',   header: 'bg-gray-200 text-gray-700', badge: 'bg-gray-300 text-gray-700 border-gray-400',  pingAnim: false },
  gecmis:      { dot: 'bg-gray-200',   header: 'bg-gray-100 text-gray-400', badge: 'bg-gray-200 text-gray-400 border-gray-300',  pingAnim: false },
};

const ZAMAN_LABEL: Record<string, string> = {
  aktif: 'Şu An', yaklasan_40: '40 dk İçinde', yaklasan_60: '1 Saat İçinde', sonra: 'Sonraki', gecmis: 'Geçmiş',
};

const STATUS_STIL: Record<string, string> = {
  bekleniyor:  'bg-gray-50 text-gray-500 border-gray-200',
  gecikiyor:   'bg-yellow-50 text-yellow-700 border-yellow-300',
  giris_eksik: 'bg-orange-50 text-orange-700 border-orange-300',
  kritik:      'bg-red-50 text-red-700 border-red-400',
  gec_geldi:   'bg-amber-50 text-amber-700 border-amber-300',
  giris_tamam: 'bg-green-50 text-green-700 border-green-300',
  derste:      'bg-green-50 text-green-700 border-green-300',
  cikis_eksik: 'bg-orange-50 text-orange-600 border-orange-200',
  erken_cikis: 'bg-purple-50 text-purple-700 border-purple-300',
  tamamlandi:  'bg-green-100 text-green-700 border-green-300',
  bkds_muaf:   'bg-blue-50 text-blue-600 border-blue-200',
};

interface OgrenciPaneliProps {
  rows: OgrenciRow[];
  filter?: string;
  colorblind?: boolean;
  onDelete?: (lessonSessionId: string, ogrenciAdi: string) => void;
}

export function OgrenciPaneli({ rows, filter, colorblind = false, onDelete }: OgrenciPaneliProps) {
  const now = new Date();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ gecmis: true, muaf: true });
  const [derslikGizli, setDerslikGizli] = useState(false);

  const filtered = filter && filter !== 'hepsi' ? rows.filter(r => r.status === filter) : rows;
  if (filtered.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Bu kategoride kayıt yok</div>;
  }

  const { saatGruplari, muaflar } = groupBySaat(filtered, now);
  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const oncelikliGruplar = saatGruplari.filter(g => ['aktif', 'yaklasan_40'].includes(g.zamanGrubu));
  const yanYana = oncelikliGruplar.slice(0, 2);
  const yanYanaKeys = new Set(yanYana.map(g => `saat-${g.saat}`));

  return (
    <div>
      <div className="flex justify-end px-4 py-2 border-b border-gray-100 bg-gray-50">
        <button
          onClick={() => setDerslikGizli(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
        >
          {derslikGizli ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {derslikGizli ? 'Derslik Göster' : 'Derslik Gizle'}
        </button>
      </div>

      {yanYana.length > 0 && (
        <div className={cn('grid border-b border-gray-200', yanYana.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {yanYana.map(({ saat, satirlar, zamanGrubu }) => {
            const stil = ZAMAN_STIL[zamanGrubu];
            const sorunlu = satirlar.filter(r => ['kritik','giris_eksik','gecikiyor','erken_cikis'].includes(r.status)).length;
            const tamam = satirlar.filter(r => ['tamamlandi','derste','giris_tamam'].includes(r.status)).length;

            return (
              <div key={`yy-${saat}`} className="border-r border-gray-200 last:border-r-0">
                <div className={cn('flex items-center gap-2 px-4 py-2.5', stil.header)}>
                  <span className="relative flex h-3 w-3 shrink-0">
                    {stil.pingAnim && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />}
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white opacity-80" />
                  </span>
                  <span className="text-lg font-bold tabular-nums">{saat}</span>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', stil.badge)}>
                    {ZAMAN_LABEL[zamanGrubu]}
                  </span>
                  <span className="text-sm opacity-80 ml-1">{satirlar.length} ders</span>
                  {sorunlu > 0 && (
                    <span className="flex items-center gap-1 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full ml-auto">
                      <AlertTriangle className="w-3 h-3" />{sorunlu}
                    </span>
                  )}
                  {tamam > 0 && sorunlu === 0 && (
                    <span className="flex items-center gap-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full ml-auto">
                      <CheckCircle2 className="w-3 h-3" />{tamam}
                    </span>
                  )}
                </div>
                <OgrenciTable satirlar={satirlar} derslikGizli={derslikGizli} kompakt
                  colorblind={colorblind} onDelete={onDelete} />
              </div>
            );
          })}
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {saatGruplari
          .filter(g => !yanYanaKeys.has(`saat-${g.saat}`))
          .map(({ saat, satirlar, zamanGrubu }) => {
            const stil = ZAMAN_STIL[zamanGrubu];
            const key = `saat-${saat}`;
            const isOpen = !(collapsed[key] ?? zamanGrubu === 'gecmis');
            const sorunlu = satirlar.filter(r => ['kritik','giris_eksik','gecikiyor','erken_cikis'].includes(r.status)).length;
            const tamam = satirlar.filter(r => ['tamamlandi','derste','giris_tamam'].includes(r.status)).length;

            return (
              <div key={key}>
                <button onClick={() => toggle(key)} className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:opacity-90', stil.header)}>
                  <span className="relative flex h-3 w-3 shrink-0">
                    {stil.pingAnim && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />}
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white opacity-80" />
                  </span>
                  <span className="text-lg font-bold tabular-nums">{saat}</span>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', stil.badge)}>
                    {ZAMAN_LABEL[zamanGrubu]}
                  </span>
                  <span className="text-sm opacity-80">{satirlar.length} ders</span>
                  {sorunlu > 0 && (
                    <span className="flex items-center gap-1 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />{sorunlu} sorun
                    </span>
                  )}
                  {tamam > 0 && (
                    <span className="flex items-center gap-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />{tamam} tamam
                    </span>
                  )}
                  <span className="ml-auto opacity-70">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>
                {isOpen && (
                  <OgrenciTable satirlar={satirlar} derslikGizli={derslikGizli}
                    colorblind={colorblind} onDelete={onDelete} />
                )}
              </div>
            );
          })}

        {muaflar.length > 0 && (
          <div>
            <button onClick={() => toggle('muaf')} className="w-full flex items-center gap-3 px-4 py-2.5 text-left bg-blue-50 border-b border-blue-100 hover:bg-blue-100 transition-colors">
              <Shield className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-sm font-bold text-blue-700">Evde Destek Eğitim</span>
              <span className="text-xs bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">
                BKDS Muaf · {muaflar.length}
              </span>
              <span className="ml-auto text-blue-400">
                {collapsed['muaf'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </span>
            </button>
            {!collapsed['muaf'] && (
              <OgrenciTable satirlar={muaflar} derslikGizli={derslikGizli}
                colorblind={colorblind} onDelete={onDelete} faded />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OgrenciTable({
  satirlar, derslikGizli, kompakt = false, colorblind = false, faded = false, onDelete,
}: {
  satirlar: OgrenciRow[];
  derslikGizli: boolean;
  kompakt?: boolean;
  colorblind?: boolean;
  faded?: boolean;
  onDelete?: (lessonSessionId: string, ogrenciAdi: string) => void;
}) {
  return (
    <table className={cn('w-full text-sm', faded && 'opacity-70')}>
      <thead>
        <tr className="text-xs border-b border-gray-100 bg-gray-50/50">
          <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Saat</th>
          <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Ad Soyad</th>
          <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Giriş / Çıkış</th>
          {!derslikGizli && <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Derslik</th>}
          <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Durum</th>
          {onDelete && <th className="w-10"></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {satirlar.map(row => (
          <OgrenciSatir key={row.id} row={row} derslikGizli={derslikGizli}
            kompakt={kompakt} colorblind={colorblind} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  );
}

function OgrenciSatir({
  row, derslikGizli, kompakt = false, colorblind = false, onDelete,
}: {
  row: OgrenciRow;
  derslikGizli: boolean;
  kompakt?: boolean;
  colorblind?: boolean;
  onDelete?: (lessonSessionId: string, ogrenciAdi: string) => void;
}) {
  const px = kompakt ? 'px-3' : 'px-4';
  const girisYapti = !!row.gercekGiris;
  const legend = LEGEND_MAP()[row.status];
  const LegendIcon = legend?.icon;

  return (
    <tr className={cn(
      'hover:bg-gray-50 transition-colors border-l-4',
      // Sol kenar rengi: giriş yapan = yeşil; kritik/giris_eksik = kırmızı; erken çıkış = mor; yoksa şeffaf
      girisYapti && row.status !== 'erken_cikis' && 'border-green-500',
      !girisYapti && ['kritik','giris_eksik'].includes(row.status) && 'border-red-500',
      !girisYapti && row.status === 'gecikiyor' && 'border-yellow-500',
      row.status === 'erken_cikis' && 'border-purple-500',
      !girisYapti && !['kritik','giris_eksik','gecikiyor','erken_cikis'].includes(row.status) && 'border-transparent',
      // Zemin
      girisYapti && !['erken_cikis'].includes(row.status) && 'bg-green-50/40',
      ['kritik','giris_eksik'].includes(row.status) && 'bg-red-50/50',
      ['gecikiyor','cikis_eksik'].includes(row.status) && 'bg-yellow-50/40',
      row.status === 'erken_cikis' && 'bg-purple-50/40',
      row.status === 'tamamlandi' && 'opacity-70',
    )}>
      <td className={cn(px, 'py-2.5 w-20 text-sm font-semibold text-gray-700 tabular-nums')}>
        {formatTime(row.baslangic)}
        <div className="text-[10px] text-gray-400 font-normal">→ {formatTime(row.bitis)}</div>
      </td>

      <td className={cn(px, 'py-2.5')}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {girisYapti && <UserCheck className="w-4 h-4 text-green-600 shrink-0" />}
          <span className="font-semibold text-gray-900 text-sm">{row.ogrenciAdi}</span>
          {row.gelmediUyari && (
            <span className="inline-flex items-center gap-0.5 text-xs bg-red-100 text-red-700 border border-red-300 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />!
            </span>
          )}
          {row.erkenCikisUyari && (
            <span className="inline-flex items-center gap-0.5 text-xs bg-purple-100 text-purple-700 border border-purple-300 px-1.5 py-0.5 rounded-full">
              <LogOut className="w-3 h-3" />Erken
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{row.ogretmenAdi}</p>
      </td>

      {/* Giriş / Çıkış yan yana tek hücrede */}
      <td className={cn(px, 'py-2.5 w-40')}>
        <div className="flex items-center gap-2 flex-wrap">
          {row.gercekGiris ? (
            <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-bold tabular-nums px-2 py-0.5 rounded-md border border-green-300">
              <UserCheck className="w-3 h-3" />
              {formatTime(row.gercekGiris)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-300 text-xs font-bold px-2 py-0.5 rounded-md border border-gray-200">
              <UserCheck className="w-3 h-3 opacity-40" />—
            </span>
          )}
          <span className="text-gray-300">·</span>
          {row.gercekCikis ? (
            <span className={cn(
              'inline-flex items-center gap-1 text-xs font-bold tabular-nums px-2 py-0.5 rounded-md border',
              row.erkenCikisUyari
                ? 'bg-purple-100 text-purple-800 border-purple-300'
                : 'bg-orange-100 text-orange-800 border-orange-300',
            )}>
              <LogOut className="w-3 h-3" />
              {formatTime(row.gercekCikis)}
            </span>
          ) : row.gercekGiris ? (
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs italic px-2 py-0.5 rounded-md border border-green-200">
              İçeride
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-300 text-xs font-bold px-2 py-0.5 rounded-md border border-gray-200">
              <LogOut className="w-3 h-3 opacity-40" />—
            </span>
          )}
        </div>
      </td>

      {!derslikGizli && (
        <td className={cn(px, 'py-2.5')}>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md whitespace-nowrap">{row.derslik}</span>
        </td>
      )}

      <td className={cn(px, 'py-2.5')}>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border',
          STATUS_STIL[row.status] ?? STATUS_STIL.bekleniyor,
          row.status === 'kritik' && 'animate-blink',
        )}>
          {colorblind && legend && LegendIcon && (
            <>
              <span className="font-bold">{legend.symbol}</span>
              <LegendIcon className="w-3 h-3" />
            </>
          )}
          {row.statusLabel}
        </span>
      </td>

      {onDelete && (
        <td className={cn(px, 'py-2.5 w-10')}>
          <button
            onClick={() => {
              if (confirm(`${row.ogrenciAdi} dersini silmek istediğinize emin misiniz?`)) {
                onDelete(row.lessonSessionId, row.ogrenciAdi);
              }
            }}
            className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Dersi sil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      )}
    </tr>
  );
}

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

export function StatusSummaryBar({ counts, activeFilter, onFilter }: StatusSummaryBarProps) {
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
}
