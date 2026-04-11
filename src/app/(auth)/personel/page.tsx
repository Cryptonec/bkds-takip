'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, UserCheck, UserX, X, Pencil, Check,
  LogOut, RefreshCw, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─────────────────────────── tipler ─────────────────────────── */
interface Staff {
  id: string;
  adSoyad: string;
  aktif: boolean;
  normalizedName: string;
}

interface PersonelLog {
  staffId: string;           // UUID veya masked ad
  ogretmenAdi: string;       // gerçek ad veya masked
  ilkGiris: string | null;
  sonCikis: string | null;
  eslesmeDurumu: string;
  tahmin: string | null;
  dersVar: boolean;
}

interface PersonelSession {
  staffId: string;
  ogretmenAdi: string;
  baslamaZamani: string | null;
  sonCikisZamani: string | null;
  status: string;
}

/* ─────────────────────────── yardımcılar ─────────────────────── */
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function getStorageKey(staffId: string, masked: string) {
  return `pname_${staffId}_${masked.substring(0, 4)}`;
}

/* ─────────────────────── İsim bileşeni ──────────────────────── */
function PersonelIsimHucre({ staffId, ogretmenAdi }: { staffId: string; ogretmenAdi: string }) {
  const isMasked = ogretmenAdi.includes('*');
  const storageKey = getStorageKey(staffId, ogretmenAdi);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [savedName, setSavedName] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
  );

  function handleSave() {
    const t = value.trim().toLocaleUpperCase('tr-TR');
    if (!t) return;
    localStorage.setItem(storageKey, t);
    setSavedName(t);
    setEditing(false);
    setValue('');
  }

  if (!isMasked) {
    return <span className="font-semibold text-gray-900">{ogretmenAdi}</span>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value.toLocaleUpperCase('tr-TR'))}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="GERÇEK İSMİ YAZ"
          className="border border-blue-300 rounded px-2 py-1 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ textTransform: 'uppercase' }}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
        <button onClick={() => { setEditing(false); setValue(''); }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {savedName
        ? <span className="font-semibold text-gray-900">{savedName}</span>
        : <span className="text-xs bg-orange-100 text-orange-700 border border-orange-300 px-2 py-0.5 rounded-full italic">
            Tanımlanmadı ({ogretmenAdi.charAt(0)}.)
          </span>
      }
      <button
        onClick={() => { setValue(savedName ?? ''); setEditing(true); }}
        className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded transition-colors"
        title={savedName ? 'İsmi düzenle' : 'İsim gir'}
      >
        <Pencil className="w-3 h-3" /> {savedName ? 'Düzenle' : 'İsim Gir'}
      </button>
    </div>
  );
}

/* ─────────────── Bugünkü Hareketler sekmesi ─────────────────── */
function BugunkuHareketler() {
  const [logs, setLogs] = useState<PersonelLog[]>([]);
  const [sessions, setSessions] = useState<PersonelSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sonGuncelleme, setSonGuncelleme] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance');
      if (!res.ok) return;
      const json = await res.json();
      setLogs(json.tumPersonelGirisler ?? []);
      setSessions(json.personelRows ?? []);
      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // Birleştir: log + session, staffId ile tekilleştir
  const birlesik: Array<{
    key: string;
    ogretmenAdi: string;
    ilkGiris: string | null;
    sonCikis: string | null;
    dersVar: boolean;
    eslesmeDurumu: string;
  }> = (() => {
    const map = new Map<string, typeof birlesik[0]>();

    // Session'lardan (ders programı olan personel)
    for (const s of sessions) {
      const existing = map.get(s.staffId);
      if (!existing) {
        map.set(s.staffId, {
          key: s.staffId,
          ogretmenAdi: s.ogretmenAdi,
          ilkGiris: s.baslamaZamani ?? null,
          sonCikis: s.sonCikisZamani ?? null,
          dersVar: true,
          eslesmeDurumu: 'tam_eslesme',
        });
      } else {
        if (s.baslamaZamani && (!existing.ilkGiris || s.baslamaZamani < existing.ilkGiris))
          existing.ilkGiris = s.baslamaZamani;
        if (s.sonCikisZamani && (!existing.sonCikis || s.sonCikisZamani > existing.sonCikis))
          existing.sonCikis = s.sonCikisZamani;
      }
    }

    // BKDS log'larından
    for (const p of logs) {
      const key = p.staffId ?? p.ogretmenAdi;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          ogretmenAdi: p.ogretmenAdi,
          ilkGiris: p.ilkGiris,
          sonCikis: p.sonCikis,
          dersVar: p.dersVar,
          eslesmeDurumu: p.eslesmeDurumu,
        });
      } else {
        if (p.ilkGiris && !existing.ilkGiris) existing.ilkGiris = p.ilkGiris;
        if (p.sonCikis && !existing.sonCikis) existing.sonCikis = p.sonCikis;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      // Önce girenler üste
      if (a.ilkGiris && b.ilkGiris) return a.ilkGiris.localeCompare(b.ilkGiris);
      if (a.ilkGiris) return -1;
      if (b.ilkGiris) return 1;
      return a.ogretmenAdi.localeCompare(b.ogretmenAdi, 'tr');
    });
  })();

  const kurumda = birlesik.filter(p => p.ilkGiris && !p.sonCikis).length;
  const ayrildi = birlesik.filter(p => p.sonCikis).length;

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Yükleniyor...</div>;
  }

  if (birlesik.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Bugün için BKDS verisi yok</div>;
  }

  return (
    <div>
      {/* Özet bar */}
      <div className="flex items-center gap-5 px-5 py-3 border-b border-gray-100 bg-gray-50 text-sm">
        <span className="text-gray-500 font-medium">{birlesik.length} personel</span>
        {kurumda > 0 && (
          <span className="flex items-center gap-1.5 text-green-600 font-semibold">
            <UserCheck className="w-4 h-4" /> {kurumda} kurumda
          </span>
        )}
        {ayrildi > 0 && (
          <span className="flex items-center gap-1.5 text-orange-500 font-semibold">
            <LogOut className="w-4 h-4" /> {ayrildi} ayrıldı
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-gray-400 text-xs">
          <Clock className="w-3 h-3" /> {sonGuncelleme}
          <button onClick={load} className="ml-2 hover:text-blue-600 transition-colors" title="Yenile">
            <RefreshCw className="w-3 h-3" />
          </button>
        </span>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide text-xs">Personel</th>
              <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide text-xs">İlk Giriş</th>
              <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide text-xs">Son Çıkış</th>
              <th className="text-left px-5 py-2.5 font-medium text-gray-400 uppercase tracking-wide text-xs">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {birlesik.map(p => {
              const halaKurumda = !!p.ilkGiris && !p.sonCikis;
              return (
                <tr key={p.key} className={cn('hover:bg-gray-50 transition-colors',
                  halaKurumda ? 'bg-green-50/30' : p.sonCikis ? '' : 'bg-gray-50/20'
                )}>
                  <td className="px-5 py-3">
                    <PersonelIsimHucre staffId={p.key} ogretmenAdi={p.ogretmenAdi} />
                    {!p.dersVar && p.ilkGiris && (
                      <span className="mt-0.5 inline-block text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full">Derssiz Gün</span>
                    )}
                  </td>
                  <td className="px-5 py-3 w-36 tabular-nums">
                    {p.ilkGiris ? (
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <span className="text-green-700 font-bold">{fmt(p.ilkGiris)}</span>
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 w-36 tabular-nums">
                    {p.sonCikis ? (
                      <div className="flex items-center gap-1.5">
                        <LogOut className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="text-orange-500 font-bold">{fmt(p.sonCikis)}</span>
                      </div>
                    ) : halaKurumda ? (
                      <span className="text-xs text-green-500 italic">Devam ediyor</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 w-32">
                    {halaKurumda ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                        <UserCheck className="w-3 h-3" /> Kurumda
                      </span>
                    ) : p.sonCikis ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                        <LogOut className="w-3 h-3" /> Ayrıldı
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────── Ana sayfa ──────────────────────────── */
export default function PersonelPage() {
  const [aktifSekme, setAktifSekme] = useState<'liste' | 'hareketler'>('liste');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adSoyad, setAdSoyad] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    const res = await fetch(`/api/personel?${params}`);
    const data = await res.json();
    setStaff(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!adSoyad.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/personel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSoyad: adSoyad.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err));
      }
      setAdSoyad('');
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personel</h1>
          <p className="text-gray-500 text-sm mt-1">{staff.length} öğretmen / uzman</p>
        </div>
        {aktifSekme === 'liste' && (
          <button
            onClick={() => { setShowForm(!showForm); setError(''); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'İptal' : 'Personel Ekle'}
          </button>
        )}
      </div>

      {/* Sekmeler */}
      <div className="border-b border-gray-200 mb-5">
        <div className="flex gap-1">
          {[
            { key: 'liste', label: 'Personel Listesi' },
            { key: 'hareketler', label: 'Bugünkü Hareketler' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setAktifSekme(s.key as any)}
              className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                aktifSekme === s.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Personel Listesi */}
      {aktifSekme === 'liste' && (
        <>
          {showForm && (
            <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Yeni Personel</h2>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ad Soyad *</label>
                  <input
                    autoFocus
                    value={adSoyad}
                    onChange={(e) => setAdSoyad(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="örn: Ayşe Öğretmen"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || !adSoyad.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-5 py-2 rounded-lg transition-colors"
                >
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
              {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
            </form>
          )}

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsme göre ara..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
            ) : staff.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {search ? 'Arama sonucu bulunamadı' : 'Henüz personel eklenmemiş'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ad Soyad</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staff.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{s.adSoyad}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{s.normalizedName}</p>
                      </td>
                      <td className="px-4 py-3">
                        {s.aktif ? (
                          <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                            <UserCheck className="w-3 h-3" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                            <UserX className="w-3 h-3" /> Pasif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Bugünkü Hareketler */}
      {aktifSekme === 'hareketler' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <BugunkuHareketler />
        </div>
      )}
    </div>
  );
}
