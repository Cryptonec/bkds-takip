'use client';
import { AlertTriangle, LogOut, Bell, Check, X, Trash2 } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { Bildirim } from '@/lib/hooks/useLiveAttendance';

interface TumBildirimlerProps {
  bildirimler: Bildirim[];
  readIds?: Set<string>;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
}

const TIP_STIL: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  gelmedi:     { bg: 'bg-red-50',     text: 'text-red-900',     icon: AlertTriangle, label: 'Gelmedi' },
  erken_cikis: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-900', icon: LogOut,        label: 'Erken Çıkış' },
};

export function TumBildirimler({
  bildirimler, readIds, onMarkRead, onDelete, onMarkAllRead, onClearAll,
}: TumBildirimlerProps) {
  if (bildirimler.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2 shrink-0">
          <Bell className="w-4 h-4 text-gray-600" />
          <span className="font-semibold text-sm text-gray-800">Bildirimler</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-gray-400">
          <Bell className="w-10 h-10 text-gray-200" />
          Şu an aktif bildirim yok
        </div>
      </div>
    );
  }

  const kritik = bildirimler.filter(b => b.severity === 'kritik').length;
  const okunmamis = readIds ? bildirimler.filter(b => !readIds.has(b.id)).length : bildirimler.length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2 shrink-0 flex-wrap">
        <Bell className="w-4 h-4 text-gray-600" />
        <span className="font-semibold text-sm text-gray-800">Bildirimler</span>
        <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
          {bildirimler.length}
        </span>
        {kritik > 0 && (
          <span className="bg-red-100 text-red-700 border border-red-300 text-xs font-bold px-2 py-0.5 rounded-full">
            {kritik} kritik
          </span>
        )}
        {okunmamis > 0 && okunmamis < bildirimler.length && (
          <span className="bg-blue-100 text-blue-700 border border-blue-300 text-xs font-bold px-2 py-0.5 rounded-full">
            {okunmamis} yeni
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onMarkAllRead && okunmamis > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-xs text-gray-600 hover:text-blue-700 hover:bg-blue-50 border border-gray-200 rounded px-2 py-1 transition-colors flex items-center gap-1"
              title="Hepsini okundu olarak işaretle"
            >
              <Check className="w-3.5 h-3.5" /> Hepsi Okundu
            </button>
          )}
          {onClearAll && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-600 hover:text-red-700 hover:bg-red-50 border border-gray-200 rounded px-2 py-1 transition-colors flex items-center gap-1"
              title="Tüm bildirimleri sil"
            >
              <Trash2 className="w-3.5 h-3.5" /> Tümünü Sil
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {bildirimler.map(b => {
          const s = TIP_STIL[b.tip] ?? TIP_STIL.gelmedi;
          const Icon = s.icon;
          const isRead = readIds?.has(b.id) ?? false;
          return (
            <div key={b.id} className={cn(
              'flex items-start gap-3 px-4 py-2.5 transition-opacity',
              isRead ? 'bg-white opacity-60' : s.bg,
            )}>
              <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', s.text, isRead && 'opacity-60')} />
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold text-sm', s.text, isRead && 'line-through')}>{b.ogrenciAdi}</p>
                <p className={cn('text-xs text-gray-600 mt-0.5', isRead && 'line-through opacity-70')}>{b.mesaj}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {b.derslik} · {formatTime(b.baslangic)}
                </p>
              </div>
              <span className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0',
                b.severity === 'kritik'
                  ? 'bg-red-100 text-red-700 border-red-300'
                  : 'bg-yellow-100 text-yellow-700 border-yellow-300',
                isRead && 'opacity-60',
              )}>
                {s.label}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {onMarkRead && !isRead && (
                  <button
                    onClick={() => onMarkRead(b.id)}
                    className="p-1 rounded text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                    title="Okundu olarak işaretle"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(b.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                    title="Bildirimi sil"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
