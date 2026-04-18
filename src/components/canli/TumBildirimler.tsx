'use client';
import { useState } from 'react';
import { AlertTriangle, LogOut, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { Bildirim } from '@/lib/hooks/useLiveAttendance';

interface TumBildirimlerProps {
  bildirimler: Bildirim[];
}

const TIP_STIL: Record<string, { bg: string; border: string; text: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  gelmedi:     { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-900',    icon: AlertTriangle, label: 'Gelmedi' },
  erken_cikis: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-900', icon: LogOut,        label: 'Erken Çıkış' },
};

export function TumBildirimler({ bildirimler }: TumBildirimlerProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (bildirimler.length === 0) {
    return (
      <div className="border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
        <Bell className="w-4 h-4 text-gray-400" />
        Şu an aktif bildirim yok
      </div>
    );
  }

  const kritik = bildirimler.filter(b => b.severity === 'kritik').length;

  return (
    <div className="border border-gray-200 bg-white rounded-xl overflow-hidden">
      <button onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors">
        <Bell className="w-4 h-4 text-gray-600" />
        <span className="font-semibold text-sm text-gray-800">Tüm Bildirimler</span>
        <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
          {bildirimler.length}
        </span>
        {kritik > 0 && (
          <span className="bg-red-100 text-red-700 border border-red-300 text-xs font-bold px-2 py-0.5 rounded-full">
            {kritik} kritik
          </span>
        )}
        <span className="ml-auto text-gray-400">
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </span>
      </button>
      {!collapsed && (
        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {bildirimler.map(b => {
            const s = TIP_STIL[b.tip] ?? TIP_STIL.gelmedi;
            const Icon = s.icon;
            return (
              <div key={b.id} className={cn('flex items-start gap-3 px-4 py-2.5', s.bg)}>
                <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', s.text)} />
                <div className="flex-1 min-w-0">
                  <p className={cn('font-semibold text-sm', s.text)}>{b.ogrenciAdi}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{b.mesaj}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.derslik} · {formatTime(b.baslangic)}
                  </p>
                </div>
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0',
                  b.severity === 'kritik'
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-yellow-100 text-yellow-700 border-yellow-300',
                )}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
