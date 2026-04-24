'use client';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useLiveAttendance } from '@/lib/hooks/useLiveAttendance';
import { OgrenciPaneli, StatusSummaryBar } from '@/components/canli/OgrenciPaneli';
import { PersonelPaneli } from '@/components/canli/PersonelPaneli';
import { BildirimPanel } from '@/components/canli/BildirimPanel';
import { ColorLegend } from '@/components/canli/ColorLegend';
import { TumBildirimler } from '@/components/canli/TumBildirimler';
import { DersEkleModal } from '@/components/canli/DersEkleModal';
import {
  RefreshCw, Wifi, WifiOff, AlertTriangle, LogOut, UserCheck, GraduationCap, Plus,
  Bell, Maximize2, Minimize2, X, Upload, CalendarDays, Tv2,
} from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

const COLORBLIND_KEY = 'canli-colorblind';
const BILDIRIM_READ_KEY = 'canli-bildirim-read';
const BILDIRIM_DELETED_KEY = 'canli-bildirim-deleted';

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

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}

export default function CanliPage() {
  const [activeTab, setActiveTab] = useState<'ogrenci' | 'personel'>('ogrenci');
  const [ogrenciFilter, setOgrenciFilter] = useState('hepsi');
  const [colorblind, setColorblind] = useState(false);
  const [dersEkleOpen, setDersEkleOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const {
    data, loading, error, lastUpdated, refresh,
    yeniBildirimler, dismissBildirim,
    yeniGirisler, yeniCikislar,
    yeniPersonelGiris, yeniPersonelCikis,
  } = useLiveAttendance(undefined, 1000);

  useEffect(() => {
    const v = localStorage.getItem(COLORBLIND_KEY);
    if (v === '1') setColorblind(true);
    setReadIds(loadSet(BILDIRIM_READ_KEY));
    setDeletedIds(loadSet(BILDIRIM_DELETED_KEY));
  }, []);

  useEffect(() => {
    localStorage.setItem(COLORBLIND_KEY, colorblind ? '1' : '0');
  }, [colorblind]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }

  function showError(msg: string) {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 4000);
  }

  async function handleDeleteLesson(lessonSessionId: string, ogrenciAdi: string) {
    try {
      const res = await fetch(`/api/lesson-sessions/${lessonSessionId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(`Silinemedi: ${data.error ?? 'bilinmeyen hata'}`);
        return;
      }
      await refresh();
    } catch {
      showError(`${ogrenciAdi} dersi silinirken hata oluştu`);
    }
  }

  // Silinmişleri dışarda bırak
  const gorunurBildirimler = useMemo(
    () => (data?.bildirimler ?? []).filter(b => !deletedIds.has(b.id)),
    [data?.bildirimler, deletedIds],
  );
  const okunmamisSayisi = gorunurBildirimler.filter(b => !readIds.has(b.id)).length;

  function markRead(id: string) {
    setReadIds(prev => {
      const next = new Set(prev); next.add(id);
      saveSet(BILDIRIM_READ_KEY, next);
      return next;
    });
  }
  function markAllRead() {
    setReadIds(prev => {
      const next = new Set(prev);
      gorunurBildirimler.forEach(b => next.add(b.id));
      saveSet(BILDIRIM_READ_KEY, next);
      return next;
    });
  }
  function deleteBildirim(id: string) {
    setDeletedIds(prev => {
      const next = new Set(prev); next.add(id);
      saveSet(BILDIRIM_DELETED_KEY, next);
      return next;
    });
  }
  function clearAllBildirim() {
    setDeletedIds(prev => {
      const next = new Set(prev);
      gorunurBildirimler.forEach(b => next.add(b.id));
      saveSet(BILDIRIM_DELETED_KEY, next);
      return next;
    });
  }

  // Bugünün yoklama listesi yüklenmemişse canlı takip boş kalır.
  // !loading + data var + hiç ders yok → engelleyici modal göster.
  const yoklamaYuklenmemis = !loading && data && data.ogrenciRows.length === 0;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <BildirimPanel bildirimler={yeniBildirimler} onDismiss={dismissBildirim} />

      {yoklamaYuklenmemis && <YoklamaGateModal />}

      {/* Hata toast — fullscreen-güvenli (alert/confirm kullanmaz) */}
      {errorToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-2xl shadow-2xl max-w-md">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium flex-1">{errorToast}</p>
          <button
            onClick={() => setErrorToast(null)}
            className="p-1 rounded hover:bg-white/20"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Öğrenci giriş toast */}
      {yeniGirisler.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {yeniGirisler.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-green-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <UserCheck className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ogrenciAdi}</p>
                <p className="text-xs text-green-100">Öğrenci Girişi · {r.derslik ?? ''} · {formatTime((r as any).gercekGiris ?? (r as any).ilkGiris)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Öğrenci çıkış toast */}
      {yeniCikislar.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
          style={{ marginTop: yeniGirisler.length > 0 ? `${yeniGirisler.length * 72 + 16}px` : '0' }}>
          {yeniCikislar.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-orange-500 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <LogOut className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ogrenciAdi}</p>
                <p className="text-xs text-orange-100">Öğrenci Çıkışı · {r.derslik ?? ''} · {formatTime((r as any).gercekCikis ?? (r as any).sonCikis)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personel giriş toast */}
      {yeniPersonelGiris.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {yeniPersonelGiris.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <GraduationCap className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ad}</p>
                <p className="text-xs text-blue-100">Derse Başladı · {r.derslik ?? ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personel çıkış toast */}
      {yeniPersonelCikis.length > 0 && (
        <div className="fixed right-4 z-50 flex flex-col gap-2 pointer-events-none"
          style={{ top: yeniPersonelGiris.length > 0 ? `${yeniPersonelGiris.length * 72 + 16}px` : '16px' }}>
          {yeniPersonelCikis.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <LogOut className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">{r.ad}</p>
                <p className="text-xs text-indigo-100">Ders Tamamlandı · {r.derslik ?? ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BKDS fetch error banner — sadece sunucu BKDS'den veri çekemiyorsa */}
      {(data as any)?.bkdsError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-start gap-3 shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-700">BKDS veri çekme hatası — veriler güncellenmiyor</p>
            <p className="text-xs text-red-600 font-mono truncate" title={(data as any).bkdsError}>{(data as any).bkdsError}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-5 shrink-0 shadow-sm">
        <SaatSayaci lastUpdated={lastUpdated} />
        <div className="h-10 w-px bg-gray-200" />

        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {gorunurBildirimler.filter(b => b.tip === 'gelmedi').length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-300 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              {gorunurBildirimler.filter(b => b.tip === 'gelmedi').length} öğrenci gelmedi
            </div>
          )}
          {gorunurBildirimler.filter(b => b.tip === 'erken_cikis').length > 0 && (
            <div className="flex items-center gap-1.5 bg-fuchsia-50 border border-fuchsia-300 text-fuchsia-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <LogOut className="w-4 h-4" />
              {gorunurBildirimler.filter(b => b.tip === 'erken_cikis').length} erken çıkış
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDersEkleOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ders Ekle
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-400 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors"
            title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full font-medium',
            error ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'
          )}>
            {error ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            {error ? 'Bağlantı Hatası' : 'Canlı · 1s'}
          </div>

          {/* Bildirimler butonu — Canlı · 5s yanında, okunmamış sayısı inline */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-1.5 border transition-colors',
              okunmamisSayisi > 0
                ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-400',
            )}
            title="Bildirimler"
          >
            <Bell className={cn('w-4 h-4', okunmamisSayisi > 0 && 'animate-pulse')} />
            Bildirimler
            <span className={cn(
              'inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-xs font-bold rounded-full tabular-nums',
              okunmamisSayisi > 0
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 text-gray-600',
            )}>
              {okunmamisSayisi}
            </span>
          </button>

          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Renk legendi */}
      <ColorLegend colorblind={colorblind} onToggleColorblind={() => setColorblind(v => !v)} />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0">
        <div className="flex">
          {[
            { key: 'ogrenci', label: 'Öğrenci Takibi', count: data?.ogrenciRows.length },
            { key: 'personel', label: 'Personel Takibi', count: (data?.tumPersonelGirisler ?? []).filter((p: any) => p.ilkGiris).length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={cn('px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}>
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-auto bg-white">
        {loading && !data && (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}
        {data && activeTab === 'ogrenci' && (
          <>
            <StatusSummaryBar counts={data.statusCounts} activeFilter={ogrenciFilter} onFilter={setOgrenciFilter} />
            <OgrenciPaneli
              rows={data.ogrenciRows}
              filter={ogrenciFilter}
              colorblind={colorblind}
              onDelete={handleDeleteLesson}
            />
          </>
        )}
        {data && activeTab === 'personel' && (
          <PersonelPaneli rows={data.personelRows} tumPersonelGirisler={data.tumPersonelGirisler ?? []} onRefresh={refresh} />
        )}
      </div>

      <DersEkleModal
        open={dersEkleOpen}
        onClose={() => setDersEkleOpen(false)}
        onCreated={() => refresh()}
      />

      {/* Bildirimler Drawer — sağdan kayan panel */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                Bildirim Merkezi
              </h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TumBildirimler
                bildirimler={gorunurBildirimler}
                readIds={readIds}
                onMarkRead={markRead}
                onDelete={deleteBildirim}
                onMarkAllRead={markAllRead}
                onClearAll={clearAllBildirim}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function YoklamaGateModal() {
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <CalendarDays className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Bugünün Yoklama Listesi Yüklenmemiş</h2>
            <p className="text-sm text-blue-100 mt-0.5">Canlı takip için ders programı gerekli</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            Canlı takip sekmesi öğrencilerin giriş-çıkışlarını ders programıyla eşleştirerek gösterir.
            Bugüne ait herhangi bir ders bulunamadı. Devam etmek için <strong>Lila'dan bugünün yoklama
            Excel'ini</strong> içe aktar.
          </p>

          <Link
            href="/import"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20"
          >
            <Upload className="w-5 h-5" />
            Yoklama Listesini Yükle
          </Link>

          <div className="border-t border-gray-200 pt-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Yoklama yüklemeden devam edebilirsin:</p>
            <Link
              href="/ekran"
              className="flex items-center gap-2 w-full border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg transition-colors justify-center"
            >
              <Tv2 className="w-4 h-4" />
              Bildirim Ekranına Geç
            </Link>
            <p className="text-xs text-gray-400 leading-snug text-center">
              Bildirim ekranı ham BKDS verisini kullanır, yoklama gerekmez.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
