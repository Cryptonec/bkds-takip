'use client';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, LogOut, Clock, CheckCircle2, Users, Shield, UserCheck,
  TimerReset,
} from 'lucide-react';

export interface LegendItem {
  key: string;
  label: string;
  colorClass: string;   // arka plan
  textClass: string;    // metin
  icon: React.ComponentType<{ className?: string }>;
  symbol: string;       // renk körü modu için şekil/harf (▲ ■ ● ◆ vb.)
}

export const LEGEND: LegendItem[] = [
  { key: 'kritik',      label: 'Kritik / Gelmedi',     colorClass: 'bg-red-500',    textClass: 'text-red-700',    icon: AlertTriangle, symbol: '■' },
  { key: 'giris_eksik', label: 'Giriş Eksik',          colorClass: 'bg-orange-500', textClass: 'text-orange-700', icon: AlertTriangle, symbol: '▲' },
  { key: 'erken_cikis', label: 'Erken Çıkış',          colorClass: 'bg-purple-500', textClass: 'text-purple-700', icon: LogOut,        symbol: '◆' },
  { key: 'cikis_eksik', label: 'Çıkış Eksik',          colorClass: 'bg-orange-400', textClass: 'text-orange-600', icon: Clock,         symbol: '▼' },
  { key: 'gecikiyor',   label: 'Gecikiyor',            colorClass: 'bg-yellow-500', textClass: 'text-yellow-700', icon: TimerReset,    symbol: '●' },
  { key: 'gec_geldi',   label: 'Geç Geldi',            colorClass: 'bg-amber-400',  textClass: 'text-amber-700',  icon: Clock,         symbol: '◐' },
  { key: 'derste',      label: 'Derste / Giriş Tamam', colorClass: 'bg-green-500',  textClass: 'text-green-700',  icon: UserCheck,     symbol: '✓' },
  { key: 'tamamlandi',  label: 'Tamamlandı',           colorClass: 'bg-green-600',  textClass: 'text-green-700',  icon: CheckCircle2,  symbol: '✔' },
  { key: 'bekleniyor',  label: 'Bekleniyor',           colorClass: 'bg-gray-400',   textClass: 'text-gray-600',   icon: Users,         symbol: '○' },
  { key: 'bkds_muaf',   label: 'BKDS Muaf (Evde Destek)', colorClass: 'bg-blue-500', textClass: 'text-blue-700',  icon: Shield,        symbol: '◇' },
];

export function LEGEND_MAP(): Record<string, LegendItem> {
  const m: Record<string, LegendItem> = {};
  for (const item of LEGEND) m[item.key] = item;
  // giris_tamam → derste ile aynı
  m['giris_tamam'] = m['derste'];
  return m;
}

interface ColorLegendProps {
  colorblind: boolean;
  onToggleColorblind: () => void;
}

export function ColorLegend({ colorblind, onToggleColorblind }: ColorLegendProps) {
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
              <span className={cn('inline-flex items-center justify-center w-4 h-4 rounded-sm text-white text-[10px] font-bold shrink-0', item.colorClass)}>
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
}
