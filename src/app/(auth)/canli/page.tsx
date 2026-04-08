'use client';
import { useState, useEffect } from 'react';
import { useLiveAttendance } from '@/lib/hooks/useLiveAttendance';
import { OgrenciPaneli, StatusSummaryBar } from '@/components/canli/OgrenciPaneli';
import { PersonelPaneli } from '@/components/canli/PersonelPaneli';
import { BildirimPanel, BildirimlerTab } from '@/components/canli/BildirimPanel';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Clock, UserCheck, LogOut, GraduationCap } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

function SaatSayaci({ lastUpdated }: { lastUpdated: Date | null }) {
  const [saat, setSaat] = useState('');
  const [tarih, setTarih] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setSaat(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTarih(now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-4">
      <div className="bg-slate-800 border border-slate-600 px-5 py-2.5 rounded-xl">
        <p className="text-2xl font-bold tabular-nums text-white tracking-tight leading-none">{saat}</p>
        <p className="text-xs text-slate-400 mt-0.5">{tarih}</p>
      </div>
      {lastUpdated && (
        <div className="text-xs">
          <p className="text-gray-400">Son güncelleme</p>
          <p className="font-semibold text-gray-700 tabular-nums">
            {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  );
}

export default function CanliPage() {
  const [activeTab, setActiveTab] = useState<'ogrenci' | 'personel' | 'bildirimler'>('ogrenci');
  const [ogrenciFilter, setOgrenciFilter] = useState('hepsi');
  const {
    data, loading, error, lastUpdated, refresh,
    yeniBildirimler, dismissBildirim,
    tabBildirimler, dismissTabBildirim,
    yeniGirisler, yeniCikislar,
    yeniPersonelGiris, yeniPersonelCikis,
  } = useLiveAttendance(undefined, 5000);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <BildirimPanel bildirimler={yeniBildirimler} onDismiss={dismissBildirim} />

      {/* Öğrenci giriş toast - yeşil, üst orta */}
      {yeniGirisler.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {yeniGirisler.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-green-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <UserCheck className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ogrenciAdi}</p>
                <p className="text-xs text-green-100">✅ Öğrenci Girişi · {r.derslik ?? ''} · {formatTime((r as any).gercekGiris ?? (r as any).ilkGiris)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Öğrenci çıkış toast - turuncu */}
      {yeniCikislar.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
          style={{ marginTop: yeniGirisler.length > 0 ? `${yeniGirisler.length * 72 + 16}px` : '0' }}>
          {yeniCikislar.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-orange-500 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <LogOut className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ogrenciAdi}</p>
                <p className="text-xs text-orange-100">👋 Öğrenci Çıkışı · {r.derslik ?? ''} · {formatTime((r as any).gercekCikis ?? (r as any).sonCikis)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personel giriş toast - mavi, sağ üst */}
      {yeniPersonelGiris.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {yeniPersonelGiris.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <GraduationCap className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ad}</p>
                <p className="text-xs text-blue-100">👨‍🏫 Derse Başladı · {r.derslik ?? ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personel çıkış toast - indigo, sağ üst (biraz aşağıda) */}
      {yeniPersonelCikis.length > 0 && (
        <div className="fixed right-4 z-50 flex flex-col gap-2 pointer-events-none"
          style={{ top: yeniPersonelGiris.length > 0 ? `${yeniPersonelGiris.length * 72 + 16}px` : '16px' }}>
          {yeniPersonelCikis.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <LogOut className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ad}</p>
                <p className="text-xs text-indigo-100">✅ Ders Tamamlandı · {r.derslik ?? ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-5 shrink-0 shadow-sm">
        <SaatSayaci lastUpdated={lastUpdated} />
        <div className="h-10 w-px bg-gray-200" />

        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {data && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <GraduationCap className="w-4 h-4" />
              Bugün {data.toplamDers ?? data.ogrenciRows.length} ders
            </div>
          )}
          {data && data.bildirimler.filter(b => b.tip === 'yaklasan').length > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-300 text-yellow-700 px-3 py-1.5 rounded-lg text-sm font-medium animate-pulse">
              <Clock className="w-4 h-4" />
              {data.bildirimler.filter(b => b.tip === 'yaklasan').length} ders yaklaşıyor
            </div>
          )}
          {data && data.bildirimler.filter(b => b.tip === 'gelmedi').length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-300 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              {data.bildirimler.filter(b => b.tip === 'gelmedi').length} öğrenci gelmedi
            </div>
          )}
          {data && data.bildirimler.filter(b => b.tip === 'erken_cikis').length > 0 && (
            <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <LogOut className="w-4 h-4" />
              {data.bildirimler.filter(b => b.tip === 'erken_cikis').length} erken çıkış
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full font-medium',
            error ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'
          )}>
            {error ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            {error ? 'Bağlantı Hatası' : 'Canlı · 5s'}
          </div>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0">
        <div className="flex">
          {[
            { key: 'ogrenci', label: 'Öğrenci Takibi', count: data?.ogrenciRows.length },
            { key: 'personel', label: 'Personel Takibi', count: (data?.tumPersonelGirisler ?? data?.personelRows ?? []).length },
            { key: 'bildirimler', label: '🔔 Bildirimler', count: tabBildirimler.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={cn('px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn('ml-2 text-xs px-1.5 py-0.5 rounded-full',
                  tab.key === 'bildirimler' && tab.count > 0
                    ? 'bg-red-500 text-white font-bold'
                    : 'bg-gray-100 text-gray-600'
                )}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white">
        {loading && !data && (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}
        {data && activeTab === 'ogrenci' && (
          <>
            <StatusSummaryBar counts={data.statusCounts} activeFilter={ogrenciFilter} onFilter={setOgrenciFilter} />
            <OgrenciPaneli rows={data.ogrenciRows} filter={ogrenciFilter} />
          </>
        )}
        {data && activeTab === 'personel' && (
          <PersonelPaneli rows={data.personelRows} tumPersonelGirisler={data.tumPersonelGirisler ?? []} onRefresh={refresh} />
        )}
        {activeTab === 'bildirimler' && (
          <BildirimlerTab bildirimler={tabBildirimler} onDismiss={dismissTabBildirim} />
        )}
      </div>
    </div>
  );
}
