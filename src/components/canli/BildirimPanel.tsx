'use client';
import { useEffect, useRef } from 'react';
import { X, Clock, AlertTriangle, LogOut } from 'lucide-react';
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
