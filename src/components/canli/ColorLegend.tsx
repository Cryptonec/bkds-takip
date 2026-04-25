'use client';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, LogOut, Clock, CheckCircle2, Users, Shield, XCircle,
  Timer, PlayCircle, CalendarDays, TimerOff, UserCheck,
} from 'lucide-react';

export interface LegendItem {
  key: string;
  label: string;
  colorClass: string;   // kart + chip arka planı (tek kaynak)
  textOnCard: string;   // kartın üzerindeki metin (text-white veya koyu)
  textClass: string;    // legend ikon tint (renk körü modu)
  icon: React.ComponentType<{ className?: string }>;
  symbol: string;       // renk körü modu için sembol (▲ ■ ● ◆ vb.)
}

/**
 * Okabe-Ito palette uyarlaması: renk körü kullanıcıların (deuteranopia,
 * protanopia, tritanopia) ayırt edebilmesi için ton + parlaklık farkları.
 * Bu palet hem ColorLegend'de hem de OgrenciPaneli kartlarında kullanılır.
 */
export const LEGEND: LegendItem[] = [
  { key: 'kritik',      label: 'Kritik / Gelmedi',     colorClass: 'bg-red-700',     textOnCard: 'text-white',      textClass: 'text-red-700',     icon: XCircle,       symbol: '■' },
  { key: 'giris_eksik', label: 'Giriş Eksik',          colorClass: 'bg-orange-500',  textOnCard: 'text-white',      textClass: 'text-orange-700',  icon: AlertTriangle, symbol: '▲' },
  { key: 'gec_geldi',   label: 'Geç Geldi',            colorClass: 'bg-amber-700',   textOnCard: 'text-white',      textClass: 'text-amber-800',   icon: Clock,         symbol: '◐' },
  { key: 'gecikiyor',   label: 'Gecikiyor',            colorClass: 'bg-yellow-300',  textOnCard: 'text-yellow-900', textClass: 'text-yellow-700',  icon: Timer,         symbol: '●' },
  { key: 'derste',      label: 'Derste / Giriş Tamam', colorClass: 'bg-sky-500',     textOnCard: 'text-white',      textClass: 'text-sky-700',     icon: PlayCircle,    symbol: '▶' },
  { key: 'tamamlandi',  label: 'Tamamlandı',           colorClass: 'bg-teal-600',    textOnCard: 'text-white',      textClass: 'text-teal-700',    icon: CheckCircle2,  symbol: '✔' },
  { key: 'erken_cikis', label: 'Erken Çıkış',          colorClass: 'bg-pink-500',    textOnCard: 'text-white',      textClass: 'text-pink-700',    icon: LogOut,        symbol: '◆' },
  { key: 'cikis_eksik', label: 'Çıkış Eksik',          colorClass: 'bg-fuchsia-700', textOnCard: 'text-white',      textClass: 'text-fuchsia-700', icon: TimerOff,      symbol: '▼' },
  { key: 'bekleniyor',  label: 'Bekleniyor',           colorClass: 'bg-slate-500',   textOnCard: 'text-white',      textClass: 'text-slate-700',   icon: CalendarDays,  symbol: '○' },
  { key: 'erken_geldi', label: 'Erken Geldi (BKDS Var)', colorClass: 'bg-emerald-500', textOnCard: 'text-white',     textClass: 'text-emerald-700', icon: UserCheck,     symbol: '★' },
  { key: 'bkds_muaf',   label: 'BKDS Muaf',            colorClass: 'bg-indigo-500',  textOnCard: 'text-white',      textClass: 'text-indigo-700',  icon: Shield,        symbol: '◇' },
];

export function LEGEND_MAP(): Record<string, LegendItem> {
  const m: Record<string, LegendItem> = {};
  for (const item of LEGEND) m[item.key] = item;
  m['giris_tamam'] = m['derste'];
  return m;
}

interface ColorLegendProps {
  colorblind: boolean;
  onToggleColorblind: () => void;
}

export const ColorLegend = memo(function ColorLegend({ colorblind, onToggleColorblind }: ColorLegendProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">Renk Anlamları:</span>
        {LEGEND.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.key}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-xs"
              title={item.label}>
              <span className={cn(
                'inline-flex items-center justify-center w-4 h-4 rounded-sm text-[10px] font-bold shrink-0',
                item.colorClass,
                item.textOnCard,
              )}>
                {colorblind ? item.symbol : null}
              </span>
              {colorblind && <Icon className={cn('w-3 h-3', item.textClass)} />}
              <span className="text-gray-700 font-medium whitespace-nowrap">{item.label}</span>
            </div>
          );
        })}
        <button
          onClick={onToggleColorblind}
          className={cn(
            'ml-auto text-xs font-semibold px-3 py-1 rounded-md border transition-colors',
            colorblind
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400',
          )}
          aria-pressed={colorblind}
          title="Renk körlüğü modunda renklerle birlikte semboller ve ikonlar görünür"
        >
          {colorblind ? '✓ Renk Körü Modu' : 'Renk Körü Modu'}
        </button>
      </div>
    </div>
  );
});
