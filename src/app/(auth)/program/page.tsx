'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Search, CalendarDays, ChevronLeft, ChevronRight, Shield, ShieldOff, Loader2 } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

interface Person { id: string; adSoyad: string; }
interface Lesson {
  id: string;
  student: Person;
  staff: Person;
  baslangic: string;
  bitis: string;
  derslik: string;
  bkdsRequired: boolean;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function addDays(d: string, n: number) {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

/* ── Kişi arama dropdown ─────────────────────────── */
function PersonSearch({ label, value, onChange, endpoint }: {
  label: string; value: Person | null;
  onChange: (p: Person | null) => void; endpoint: string;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&limit=8`);
      setResults(await res.json());
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [q, endpoint]);

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2">
          <span className="flex-1 text-sm font-medium text-blue-800">{value.adSoyad}</span>
          <button onClick={() => { onChange(null); setQ(''); }} className="text-blue-400 hover:text-blue-700">✕</button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`${label} ara…`}
            value={q}
            onChange={e => setQ(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onFocus={() => results.length > 0 && setOpen(true)}
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {results.map(p => (
                <button key={p.id} onMouseDown={() => { onChange(p); setQ(''); setOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700">
                  {p.adSoyad}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Ders Ekleme Formu ───────────────────────────── */
function EkleFormu({ tarih, onSaved, onCancel }: { tarih: string; onSaved: () => void; onCancel: () => void }) {
  const [student, setStudent] = useState<Person | null>(null);
  const [staff,   setStaff]   = useState<Person | null>(null);
  const [form, setForm] = useState({
    baslangicSaati: '09:00', bitisSaati: '09:50', derslik: '', bkdsRequired: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !staff) { setErr('Öğrenci ve öğretmen seçilmeli'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, staffId: staff.id, tarih, ...form }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? 'Hata'); setSaving(false); return; }
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-4 space-y-4">
      <p className="font-semibold text-blue-800 text-sm">Yeni Ders Ekle — {fmtDate(tarih)}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PersonSearch label="Öğrenci" value={student} onChange={setStudent} endpoint="/api/ogrenciler" />
        <PersonSearch label="Öğretmen" value={staff}   onChange={setStaff}   endpoint="/api/personel" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Başlangıç</label>
          <input type="time" value={form.baslangicSaati}
            onChange={e => setForm(f => ({ ...f, baslangicSaati: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bitiş</label>
          <input type="time" value={form.bitisSaati}
            onChange={e => setForm(f => ({ ...f, bitisSaati: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Derslik</label>
          <input value={form.derslik} onChange={e => setForm(f => ({ ...f, derslik: e.target.value }))}
            placeholder="Örn: Salon 1" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.bkdsRequired}
              onChange={e => setForm(f => ({ ...f, bkdsRequired: e.target.checked }))}
              className="w-4 h-4 rounded" />
            <span className="text-xs text-gray-600">BKDS Gerekli</span>
          </label>
        </div>
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          İptal
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Ekle
        </button>
      </div>
    </form>
  );
}

/* ── Ana Sayfa ───────────────────────────────────── */
export default function ProgramPage() {
  const [tarih, setTarih] = useState(todayStr);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEkle, setShowEkle] = useState(false);
  const [search, setSearch] = useState('');
  const [silConfirm, setSilConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/program?tarih=${tarih}`);
    setLessons(await res.json());
    setLoading(false);
  }, [tarih]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    await fetch(`/api/program/${id}`, { method: 'DELETE' });
    setSilConfirm(null);
    load();
  }

  const q = search.toLowerCase();
  const filtered = lessons.filter(l =>
    !q || l.student.adSoyad.toLowerCase().includes(q) || l.staff.adSoyad.toLowerCase().includes(q) || l.derslik.toLowerCase().includes(q)
  );

  // Saate göre grupla
  const groups = new Map<string, Lesson[]>();
  for (const l of filtered) {
    const key = formatTime(l.baslangic);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0 shadow-sm">
        <CalendarDays className="w-5 h-5 text-blue-600" />
        <h1 className="text-lg font-bold text-gray-900">Program Yönetimi</h1>
        <div className="h-6 w-px bg-gray-200" />

        {/* Tarih navigasyon */}
        <div className="flex items-center gap-1">
          <button onClick={() => setTarih(d => addDays(d, -1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={tarih} onChange={e => setTarih(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => setTarih(d => addDays(d, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
          {tarih !== todayStr() && (
            <button onClick={() => setTarih(todayStr())}
              className="ml-1 text-xs text-blue-600 hover:underline font-medium">Bugün</button>
          )}
        </div>
        <span className="text-sm text-gray-500 hidden sm:block">{fmtDate(tarih)}</span>

        <div className="flex-1" />

        {/* Ara */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Öğrenci, öğretmen, derslik…"
            className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Sayı */}
        <span className="text-sm text-gray-500">{filtered.length} ders</span>

        <button onClick={() => setShowEkle(v => !v)}
          className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            showEkle ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700')}>
          <Plus className="w-4 h-4" />
          Ders Ekle
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {showEkle && (
          <EkleFormu tarih={tarih} onSaved={() => { setShowEkle(false); load(); }} onCancel={() => setShowEkle(false)} />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">
            {search ? 'Arama sonucu bulunamadı' : 'Bu tarih için ders kaydı yok'}
          </div>
        ) : (
          <div className="space-y-5 max-w-5xl mx-auto">
            {[...groups.entries()].map(([saat, liste]) => (
              <div key={saat}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold text-gray-500 tracking-wider">{saat}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">{liste.length} ders</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {liste.map(l => (
                    <div key={l.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 group">
                      {/* Saat */}
                      <div className="text-xs text-gray-400 font-mono w-20 shrink-0">
                        {formatTime(l.baslangic)} – {formatTime(l.bitis)}
                      </div>
                      {/* Öğrenci */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{l.student.adSoyad}</p>
                        <p className="text-xs text-gray-400 truncate">{l.staff.adSoyad}</p>
                      </div>
                      {/* Derslik */}
                      <div className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium shrink-0">
                        {l.derslik}
                      </div>
                      {/* BKDS */}
                      <div className={cn('shrink-0', l.bkdsRequired ? 'text-blue-500' : 'text-gray-300')} title={l.bkdsRequired ? 'BKDS Gerekli' : 'BKDS Muaf'}>
                        {l.bkdsRequired ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                      </div>
                      {/* Sil */}
                      {silConfirm === l.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-red-600">Emin misiniz?</span>
                          <button onClick={() => handleDelete(l.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50">Sil</button>
                          <button onClick={() => setSilConfirm(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">İptal</button>
                        </div>
                      ) : (
                        <button onClick={() => setSilConfirm(l.id)}
                          className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
