'use client';
import { useEffect, useRef } from 'react';
import { X, Clock, AlertTriangle, LogOut, Bell, BellOff } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { Bildirim } from '@/lib/hooks/useLiveAttendance';

interface BildirimPanelProps {
  bildirimler: Bildirim[];
  onDismiss: (id: string) => void;
}

export function BildirimPanel({ bildirimler, onDismiss }: BildirimPanelProps) {
  if (bildirimler.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {bildirimler.map(b => (
        <BildirimKart key={b.id} bildirim={b} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ----- Bildirimler Tab (kalıcı liste görünümü) -----

const tipConfig = {
  yaklasan: {
    bg: 'bg-yellow-50 border-yellow-200',
    headerBg: 'bg-yellow-100 border-yellow-300',
    text: 'text-yellow-900',
    iconBg: 'bg-yellow-200',
    icon: <Clock className="w-4 h-4 text-yellow-700" />,
    baslik: 'Ders Yaklaşıyor',
    emoji: '⚠️',
    countBg: 'bg-yellow-500',
  },
  gelmedi: {
    bg: 'bg-red-50 border-red-200',
    headerBg: 'bg-red-100 border-red-300',
    text: 'text-red-900',
    iconBg: 'bg-red-200',
    icon: <AlertTriangle className="w-4 h-4 text-red-700" />,
    baslik: 'Öğrenci Gelmedi',
    emoji: '🚨',
    countBg: 'bg-red-500',
  },
  erken_cikis: {
    bg: 'bg-purple-50 border-purple-200',
    headerBg: 'bg-purple-100 border-purple-300',
    text: 'text-purple-900',
    iconBg: 'bg-purple-200',
    icon: <LogOut className="w-4 h-4 text-purple-700" />,
    baslik: 'Erken Çıkış',
    emoji: '⚡',
    countBg: 'bg-purple-500',
  },
} as const;

function BildirimGrubu({ tip, liste, onDismiss }: { tip: keyof typeof tipConfig; liste: Bildirim[]; onDismiss: (id: string) => void }) {
  const c = tipConfig[tip];
  return (
    <div className={cn('rounded-xl border overflow-hidden', c.bg)}>
      <div className={cn('flex items-center gap-2 px-4 py-3 border-b', c.headerBg)}>
        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center', c.iconBg)}>
          {c.icon}
        </div>
        <span className={cn('font-semibold text-sm', c.text)}>{c.emoji} {c.baslik}</span>
        <span className={cn('ml-auto text-white text-xs font-bold px-2 py-0.5 rounded-full', c.countBg)}>
          {liste.length}
        </span>
      </div>
      <div className="divide-y divide-white/60">
        {liste.map(b => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-3 group">
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold truncate', c.text)}>{b.ogrenciAdi}</p>
              <p className={cn('text-xs mt-0.5 opacity-75', c.text)}>{b.mesaj}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('text-xs font-medium', c.text)}>{b.derslik}</p>
              <p className={cn('text-xs opacity-60', c.text)}>{formatTime(b.baslangic)}</p>
            </div>
            <button
              onClick={() => onDismiss(b.id)}
              title="Bildirimi kapat"
              className={cn('shrink-0 ml-1 p-1.5 rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity', c.text)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BildirimlerTab({ bildirimler, onDismiss }: { bildirimler: Bildirim[]; onDismiss: (id: string) => void }) {
  const yaklasanlar = bildirimler.filter(b => b.tip === 'yaklasan');
  const gelmediler  = bildirimler.filter(b => b.tip === 'gelmedi');
  const erkenler    = bildirimler.filter(b => b.tip === 'erken_cikis');

  if (bildirimler.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
        <BellOff className="w-12 h-12 opacity-30" />
        <p className="text-base font-medium">Aktif bildirim yok</p>
        <p className="text-sm opacity-60">Tüm dersler normal seyrediyor</p>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-3xl mx-auto flex flex-col gap-4">
      {/* Özet */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { tip: 'yaklasan', label: 'Yaklaşan Ders', count: yaklasanlar.length, bg: 'bg-yellow-50 border-yellow-200', num: 'text-yellow-700' },
          { tip: 'gelmedi',  label: 'Gelmedi',        count: gelmediler.length,  bg: 'bg-red-50 border-red-200',       num: 'text-red-700' },
          { tip: 'erken_cikis', label: 'Erken Çıkış', count: erkenler.length,    bg: 'bg-purple-50 border-purple-200', num: 'text-purple-700' },
        ] as const).map(item => (
          <div key={item.tip} className={cn('rounded-xl border p-4 text-center', item.bg)}>
            <p className={cn('text-3xl font-bold tabular-nums', item.num)}>{item.count}</p>
            <p className="text-xs text-gray-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Gruplar */}
      {gelmediler.length  > 0 && <BildirimGrubu tip="gelmedi"     liste={gelmediler}  onDismiss={onDismiss} />}
      {erkenler.length    > 0 && <BildirimGrubu tip="erken_cikis" liste={erkenler}    onDismiss={onDismiss} />}
      {yaklasanlar.length > 0 && <BildirimGrubu tip="yaklasan"    liste={yaklasanlar} onDismiss={onDismiss} />}
    </div>
  );
}

// ----- Toast panel (sağ alt köşe) -----

function BildirimKart({ bildirim, onDismiss }: { bildirim: Bildirim; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(bildirim.id), 10000);
    return () => clearTimeout(timerRef.current);
  }, [bildirim.id, onDismiss]);

  const styles = {
    yaklasan:    { bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-900', icon: <Clock className="w-4 h-4 text-yellow-600" />, baslik: '⚠️ Ders Yaklaşıyor', iconBg: 'bg-yellow-100' },
    gelmedi:     { bg: 'bg-red-50 border-red-300',       text: 'text-red-900',    icon: <AlertTriangle className="w-4 h-4 text-red-600" />, baslik: '🚨 Öğrenci Gelmedi', iconBg: 'bg-red-100' },
    erken_cikis: { bg: 'bg-purple-50 border-purple-300', text: 'text-purple-900', icon: <LogOut className="w-4 h-4 text-purple-600" />,    baslik: '⚡ Erken Çıkış',     iconBg: 'bg-purple-100' },
  };
  const s = styles[bildirim.tip];

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border shadow-lg p-4 pr-3', s.bg, s.text)}>
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5', s.iconBg)}>
        {s.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">{s.baslik}</p>
        <p className="text-xs mt-0.5 opacity-80">{bildirim.mesaj}</p>
        <p className="text-xs mt-1 opacity-60">{bildirim.derslik} · {formatTime(bildirim.baslangic)}</p>
      </div>
      <button onClick={() => onDismiss(bildirim.id)} className="shrink-0 opacity-40 hover:opacity-100 p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
