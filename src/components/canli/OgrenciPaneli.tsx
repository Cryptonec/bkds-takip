'use client';
import { useState } from 'react';
import { formatTime } from '@/lib/utils';
import type { OgrenciRow } from '@/lib/hooks/useLiveAttendance';
import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle2, Shield, ChevronDown, ChevronUp, UserCheck, Eye, EyeOff, LogOut } from 'lucide-react';

function getZamanGrubu(row: OgrenciRow, now: Date): 'gecmis' | 'aktif' | 'yaklasan_40' | 'yaklasan_60' | 'sonra' {
  if (row.status === 'bkds_muaf') return 'sonra';
  const baslangic = new Date(row.baslangic);
  const bitis = new Date(row.bitis);
  const dakikaKaldi = (baslangic.getTime() - now.getTime()) / 60000;
  // Geçmiş: ders bitişinden 30 dk sonra
  if (now.getTime() > bitis.getTime() + 30 * 60 * 1000) return 'gecmis';
  if (dakikaKaldi <= 0) return 'aktif';
  if (dakikaKaldi <= 40) return 'yaklasan_40';
  if (dakikaKaldi <= 60) return 'yaklasan_60';
  return 'sonra';
}

function groupBySaat(rows: OgrenciRow[], now: Date) {
  const zamanOrder: Record<string, number> = {
    aktif: 0, yaklasan_40: 1, yaklasan_60: 2, sonra: 3, gecmis: 4,
  };
  const muaflar = rows.filter(r => r.status === 'bkds_muaf');
  const diger = rows.filter(r => r.status !== 'bkds_muaf');

  const saatMap = new Map<string, OgrenciRow[]>();
  for (const row of diger) {
    const saat = formatTime(row.baslangic);
    const existing = saatMap.get(saat) ?? [];
    existing.push(row);
    saatMap.set(saat, existing);
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
}

export function OgrenciPaneli({ rows, filter }: OgrenciPaneliProps) {
  const now = new Date();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ gecmis: true, muaf: true });
  const [derslikGizli, setDerslikGizli] = useState(false);

  const filtered = filter && filter !== 'hepsi' ? rows.filter(r => r.status === filter) : rows;
  if (filtered.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Bu kategoride kayıt yok</div>;
  }

  const { saatGruplari, muaflar } = groupBySaat(filtered, now);
  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // En yakın 2 aktif/yaklaşan grup — bunları yan yana göster
  const oncelikliGruplar = saatGruplari.filter(g => ['aktif', 'yaklasan_40'].includes(g.zamanGrubu));
  const yanYana = oncelikliGruplar.slice(0, 2);
  const yanYanaKeys = new Set(yanYana.map(g => `saat-${g.saat}`));

  return (
    <div>
      {/* Derslik göster/gizle */}
      <div className="flex justify-end px-4 py-2 border-b border-gray-100 bg-gray-50">
        <button
          onClick={() => setDerslikGizli(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
        >
          {derslikGizli ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {derslikGizli ? 'Derslik Göster' : 'Derslik Gizle'}
        </button>
      </div>

      {/* Yan yana en yakın 2 saat grubu */}
      {yanYana.length > 0 && (
        <div className={cn('grid border-b border-gray-200', yanYana.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {yanYana.map(({ saat, satirlar, zamanGrubu }) => {
            const stil = ZAMAN_STIL[zamanGrubu];
            const sorunlu = satirlar.filter(r => ['kritik','giris_eksik','gecikiyor','erken_cikis'].includes(r.status)).length;
            const tamam = satirlar.filter(r => ['tamamlandi','derste','giris_tamam'].includes(r.status)).length;

            return (
              <div key={`yy-${saat}`} className="border-r border-gray-200 last:border-r-0">
                {/* Başlık */}
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
                {/* Tablo */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-3 py-2 font-medium text-gray-400 uppercase tracking-wide">Ad Soyad</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-400 uppercase tracking-wide">Giriş</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-400 uppercase tracking-wide">Çıkış</th>
                      {!derslikGizli && <th className="text-left px-3 py-2 font-medium text-gray-400 uppercase tracking-wide">Derslik</th>}
                      <th className="text-left px-3 py-2 font-medium text-gray-400 uppercase tracking-wide">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {satirlar.map(row => <OgrenciSatir key={row.id} row={row} derslikGizli={derslikGizli} kompakt />)}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Diğer gruplar - tek sütun */}
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
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Ad Soyad</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">İlk Giriş</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Son Çıkış</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Bitiş</th>
                        {!derslikGizli && <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Derslik</th>}
                        <th className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wide">Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {satirlar.map(row => <OgrenciSatir key={row.id} row={row} derslikGizli={derslikGizli} />)}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

        {/* BKDS Muaf */}
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
              <table className="w-full text-sm opacity-70">
                <tbody className="divide-y divide-gray-50">
                  {muaflar.map(row => <OgrenciSatir key={row.id} row={row} derslikGizli={derslikGizli} />)}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OgrenciSatir({ row, derslikGizli, kompakt = false }: { row: OgrenciRow; derslikGizli: boolean; kompakt?: boolean }) {
  const px = kompakt ? 'px-3' : 'px-4';
  return (
    <tr className={cn(
      'hover:bg-gray-50 transition-colors',
      ['kritik','giris_eksik'].includes(row.status) && 'bg-red-50/50',
      ['gecikiyor','cikis_eksik'].includes(row.status) && 'bg-yellow-50/40',
      row.status === 'erken_cikis' && 'bg-purple-50/40',
      row.status === 'tamamlandi' && 'opacity-55',
    )}>
      <td className={cn(px, 'py-2.5')}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">{row.ogrenciAdi}</span>
          {row.yaklasanUyari && (
            <span className="inline-flex items-center gap-0.5 text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 px-1.5 py-0.5 rounded-full animate-pulse">
              <Clock className="w-3 h-3" />{row.dakikaKaldi}dk
            </span>
          )}
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

      <td className={cn(px, 'py-2.5 w-24')}>
        {row.gercekGiris ? (
          <div className="flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span className="text-green-700 font-bold tabular-nums text-sm">{formatTime(row.gercekGiris)}</span>
          </div>
        ) : <span className="text-gray-200 text-sm">—</span>}
      </td>

      <td className={cn(px, 'py-2.5 w-24')}>
        {row.gercekCikis ? (
          <div className="flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className={cn('font-bold tabular-nums text-sm', row.erkenCikisUyari ? 'text-purple-600' : 'text-orange-500')}>
              {formatTime(row.gercekCikis)}
            </span>
          </div>
        ) : row.gercekGiris ? (
          <span className="text-xs text-green-500 italic">İçeride</span>
        ) : <span className="text-gray-200 text-sm">—</span>}
      </td>

      {!kompakt && (
        <td className={cn(px, 'py-2.5 w-16 text-xs text-gray-400 tabular-nums')}>
          {formatTime(row.bitis)}
        </td>
      )}

      {!derslikGizli && (
        <td className={cn(px, 'py-2.5')}>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md whitespace-nowrap">{row.derslik}</span>
        </td>
      )}

      <td className={cn(px, 'py-2.5')}>
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border',
          STATUS_STIL[row.status] ?? STATUS_STIL.bekleniyor,
          row.status === 'kritik' && 'animate-blink',
        )}>
          {row.statusLabel}
        </span>
      </td>
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
