'use client';
import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  BookOpen, CheckCircle, AlertTriangle, Clock,
  UserX, LogOut, Shield, Users, RefreshCw,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface DashboardStats {
  tarih: string;
  toplamDers: number;
  bkdsGerekli: number;
  bkdsMuaf: number;
  bekleniyor: number;
  gecikiyor: number;
  girisEksik: number;
  cikisEksik: number;
  gecGeldi: number;
  tamamlandi: number;
  personelDerste: number;
  personelGeciyor: number;
  personelGelmedi: number;
  aktifAlert: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [bkdsLoading, setBkdsLoading] = useState(false);
  const [bkdsMsg, setBkdsMsg] = useState('');

  async function loadStats() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setStats(data);
    } catch {
      // API henüz hazır değil (DB migration bekleniyor)
    } finally {
      setLoading(false);
    }
  }

  async function triggerBkds() {
    setBkdsLoading(true);
    setBkdsMsg('');
    try {
      const res = await fetch('/api/bkds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      setBkdsMsg(`✓ ${data.recordCount} kayıt çekildi`);
      await loadStats();
    } catch {
      setBkdsMsg('Hata oluştu');
    } finally {
      setBkdsLoading(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {stats ? formatDate(stats.tarih) : 'Bugün'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {bkdsMsg && (
            <span className="text-sm text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
              {bkdsMsg}
            </span>
          )}
          <button
            onClick={triggerBkds}
            disabled={bkdsLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${bkdsLoading ? 'animate-spin' : ''}`} />
            BKDS Yenile
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Alert banner */}
          {stats.aktifAlert > 0 && (
            <div className="mb-5 flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <p className="text-red-700 font-medium text-sm">
                  {stats.aktifAlert} aktif uyarı var
                </p>
              </div>
              <Link href="/canli" className="text-sm text-red-600 hover:underline font-medium">
                Canlı takibe git →
              </Link>
            </div>
          )}

          {/* Öğrenci stats */}
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Öğrenci Devamsızlık</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Toplam Ders" value={stats.toplamDers} icon={BookOpen} color="blue" />
            <StatCard title="Tamamlandı" value={stats.tamamlandi} icon={CheckCircle} color="green" />
            <StatCard title="Giriş Eksik" value={stats.girisEksik} icon={AlertTriangle} color="red" subtitle="kritik dahil" />
            <StatCard title="Çıkış Eksik" value={stats.cikisEksik} icon={LogOut} color="orange" />
            <StatCard title="Gecikiyor" value={stats.gecikiyor} icon={Clock} color="yellow" />
            <StatCard title="Geç Geldi" value={stats.gecGeldi} icon={Clock} color="yellow" />
            <StatCard title="BKDS Muaf" value={stats.bkdsMuaf} icon={Shield} color="gray" subtitle="Evde Destek Eğitim" />
            <StatCard title="Bekleniyor" value={stats.bekleniyor} icon={Users} color="gray" />
          </div>

          {/* Personel stats */}
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Personel Durumu</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard title="Derste" value={stats.personelDerste} icon={CheckCircle} color="green" />
            <StatCard title="Gecikiyor" value={stats.personelGeciyor} icon={Clock} color="yellow" />
            <StatCard title="Gelmedi" value={stats.personelGelmedi} icon={UserX} color="red" />
          </div>

          {/* Quick actions */}
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Hızlı İşlemler</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: '/canli', label: 'Canlı Takip', desc: 'Anlık durum izle' },
              { href: '/import', label: 'Lila Yükle', desc: 'Excel/CSV içe aktar' },
              { href: '/ogrenciler', label: 'Öğrenciler', desc: 'Öğrenci listesi' },
              { href: '/raporlar', label: 'Raporlar', desc: 'Geçmiş sorgula' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
