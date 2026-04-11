'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, UserCheck, UserX, X, Pencil, Check,
  LogOut, RefreshCw, Clock, Download, Trash2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─────────────────────────── tipler ─────────────────────────── */
interface Staff {
  id: string;
  adSoyad: string;
  aktif: boolean;
  normalizedName: string;
}

interface BkdsUnmatched {
  maskedAd: string;
  tahminEdilenAd: string | null;
}

interface PersonelLog {
  staffId: string;
  ogretmenAdi: string;
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

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/* ─────────────── Satır düzenleme bileşeni ───────────────────── */
function StaffSatir({
  staff,
  onUpdate,
  onDelete,
}: {
  staff: Staff;
  onUpdate: (id: string, data: Partial<Pick<Staff, 'adSoyad' | 'aktif'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(staff.adSoyad);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function saveAd() {
    if (!value.trim() || value.trim() === staff.adSoyad) { setEditing(false); return; }
    setSaving(true);
    await onUpdate(staff.id, { adSoyad: value.trim() });
    setSaving(false);
    setEditing(false);
  }

  async function toggleAktif() {
    setSaving(true);
    await onUpdate(staff.id, { aktif: !staff.aktif });
    setSaving(false);
  }

  async function handleDelete() {
    setSaving(true);
    await onDelete(staff.id);
    setSaving(false);
    setConfirming(false);
  }

  return (
    <tr className={cn('hover:bg-gray-50 transition-colors', !staff.aktif && 'opacity-60')}>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveAd();
                if (e.key === 'Escape') { setEditing(false); setValue(staff.adSoyad); }
              }}
              className="border border-blue-300 rounded px-2 py-1 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={saveAd} disabled={saving} className="text-green-600 hover:text-green-800 disabled:opacity-40">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setEditing(false); setValue(staff.adSoyad); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{staff.adSoyad}</span>
            {staff.adSoyad.includes('*') && (
              <span className="text-xs bg-orange-100 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-full">maskeli</span>
            )}
            <button
              onClick={() => { setValue(staff.adSoyad); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-colors"
              title="İsmi düzenle"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-0.5 font-mono">{staff.normalizedName}</p>
      </td>

      <td className="px-4 py-3">
        <button
          onClick={toggleAktif}
          disabled={saving}
          className="disabled:opacity-40 transition-opacity"
          title={staff.aktif ? 'Pasife al' : 'Aktife al'}
        >
          {staff.aktif ? (
            <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium hover:bg-green-100">
              <UserCheck className="w-3 h-3" /> Aktif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium hover:bg-gray-100">
              <UserX className="w-3 h-3" /> Pasif
            </span>
          )}
        </button>
      </td>

      <td className="px-4 py-3">
        <button
          onClick={() => { setValue(staff.adSoyad); setEditing(true); }}
          className="text-gray-400 hover:text-blue-600 transition-colors mr-2"
          title="Düzenle"
        >
          <Pencil className="w-4 h-4" />
        </button>
        {confirming ? (
          <span className="inline-flex items-center gap-1">
            <button onClick={handleDelete} disabled={saving} className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-40">
              Evet sil
            </button>
            <button onClick={() => setConfirming(false)} className="text-gray-400 hover:text-gray-600 text-xs ml-1">
              İptal
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-gray-300 hover:text-red-500 transition-colors"
            title="Sil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
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

  const birlesik: Array<{
    key: string;
    ogretmenAdi: string;
    ilkGiris: string | null;
    sonCikis: string | null;
    dersVar: boolean;
    eslesmeDurumu: string;
  }> = (() => {
    const map = new Map<string, typeof birlesik[0]>();
    for (const s of sessions) {
      const existing = map.get(s.staffId);
      if (!existing) {
        map.set(s.staffId, {
          key: s.staffId, ogretmenAdi: s.ogretmenAdi,
          ilkGiris: s.baslamaZamani ?? null, sonCikis: s.sonCikisZamani ?? null,
          dersVar: true, eslesmeDurumu: 'tam_eslesme',
        });
      } else {
        if (s.baslamaZamani && (!existing.ilkGiris || s.baslamaZamani < existing.ilkGiris))
          existing.ilkGiris = s.baslamaZamani;
        if (s.sonCikisZamani && (!existing.sonCikis || s.sonCikisZamani > existing.sonCikis))
          existing.sonCikis = s.sonCikisZamani;
      }
    }
    for (const p of logs) {
      const key = p.staffId ?? p.ogretmenAdi;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key, ogretmenAdi: p.ogretmenAdi,
          ilkGiris: p.ilkGiris, sonCikis: p.sonCikis,
          dersVar: p.dersVar, eslesmeDurumu: p.eslesmeDurumu,
        });
      } else {
        if (p.ilkGiris && !existing.ilkGiris) existing.ilkGiris = p.ilkGiris;
        if (p.sonCikis && !existing.sonCikis) existing.sonCikis = p.sonCikis;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.ilkGiris && b.ilkGiris) return a.ilkGiris.localeCompare(b.ilkGiris);
      if (a.ilkGiris) return -1;
      if (b.ilkGiris) return 1;
      return a.ogretmenAdi.localeCompare(b.ogretmenAdi, 'tr');
    });
  })();

  const kurumda = birlesik.filter(p => p.ilkGiris && !p.sonCikis).length;
  const ayrildi = birlesik.filter(p => p.sonCikis).length;

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Yükleniyor...
    </div>
  );

  if (birlesik.length === 0) return (
    <div className="text-center py-16 text-gray-400 text-sm">Bugün için BKDS verisi yok</div>
  );

  return (
    <div>
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
                    <span className="font-semibold text-gray-900">{p.ogretmenAdi}</span>
                    {!p.dersVar && p.ilkGiris && (
                      <span className="mt-0.5 ml-2 inline-block text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full">Derssiz Gün</span>
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

  // BKDS eşleşmemiş personel
  const [bkdsUnmatched, setBkdsUnmatched] = useState<BkdsUnmatched[]>([]);
  const [syncing, setSyncing] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/personel');
    if (res.ok) {
      const data = await res.json();
      setStaff(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  const loadBkdsUnmatched = useCallback(async () => {
    const res = await fetch('/api/personel?source=bkds');
    if (res.ok) {
      const data = await res.json();
      setBkdsUnmatched(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    loadStaff();
    loadBkdsUnmatched();
  }, [loadStaff, loadBkdsUnmatched]);

  // Arama filtresi (client-side)
  const filtered = staff.filter(s =>
    !search || s.adSoyad.toLowerCase().includes(search.toLowerCase())
  );

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
        throw new Error(err.error ?? JSON.stringify(err));
      }
      setAdSoyad('');
      setShowForm(false);
      await loadStaff();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/personel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      if (res.ok) {
        await loadStaff();
        await loadBkdsUnmatched();
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpdate(id: string, data: Partial<Pick<Staff, 'adSoyad' | 'aktif'>>) {
    const res = await fetch(`/api/personel/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setStaff(prev => prev.map(s => s.id === id ? updated : s));
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/personel/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setStaff(prev => prev.filter(s => s.id !== id));
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
          {/* BKDS'den yeni gelen personel banner */}
          {bkdsUnmatched.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800">
                  BKDS'de {bkdsUnmatched.length} yeni personel tespit edildi
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Son 30 günde görülen, henüz listede olmayan personel
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                {syncing ? 'Ekleniyor...' : 'Listeye Ekle'}
              </button>
            </div>
          )}

          {/* Yeni personel formu */}
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
                    placeholder="örn: Ayşe Yılmaz"
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

          {/* Arama */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsme göre ara..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Liste */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {search ? 'Arama sonucu bulunamadı' : 'Henüz personel eklenmemiş'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ad Soyad</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Durum</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 w-24">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((s) => (
                    <StaffSatir
                      key={s.id}
                      staff={s}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
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
