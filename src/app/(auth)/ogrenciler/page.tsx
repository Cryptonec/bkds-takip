'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Plus, UserCheck, UserX, Upload, Loader2, Trash2 } from 'lucide-react';

interface Student {
  id: string;
  adSoyad: string;
  ogrenciNo?: string;
  aktif: boolean;
  normalizedName: string;
}

export default function OgrencilerPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ adSoyad: '', ogrenciNo: '' });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; deletedDups?: number } | null>(null);
  const [deduping, setDeduping] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    const res = await fetch(`/api/ogrenciler?${params}`);
    setStudents(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/ogrenciler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ adSoyad: '', ogrenciNo: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleDedup() {
    if (!confirm('Yinelenen öğrenci kayıtları silinecek. Devam edilsin mi?')) return;
    setDeduping(true);
    const res = await fetch('/api/ogrenciler/dedup', { method: 'POST' });
    const data = await res.json();
    alert(`Temizlendi: ${data.deletedDups} yinelenen, ${data.deletedJunk} geçersiz kayıt silindi.`);
    setDeduping(false);
    load();
  }

  async function handleDelete(id: string, adSoyad: string) {
    if (!confirm(`"${adSoyad}" silinecek. Emin misiniz?`)) return;
    setDeletingId(id);
    await fetch(`/api/ogrenciler/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    load();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ogrenciler/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Hata oluştu');
        return;
      }
      setImportResult({ created: data.created ?? 0, updated: data.updated ?? 0, deletedDups: data.deletedDups ?? 0 });
      load();
    } catch {
      alert('Dosya gönderilemedi.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Öğrenciler</h1>
          <p className="text-gray-500 text-sm mt-1">{students.length} öğrenci</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.html,.htm"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={handleDedup}
            disabled={deduping}
            className="flex items-center gap-2 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {deduping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Tekrarlananları Temizle
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {importing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Upload className="w-4 h-4" />
            }
            {importing ? 'İçe Aktarılıyor…' : 'Excel/CSV\'den Aktar'}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Öğrenci Ekle
          </button>
        </div>
      </div>

      {importResult && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl">
          <UserCheck className="w-4 h-4 shrink-0" />
          İçe aktarma tamamlandı: <strong>{importResult.created} yeni</strong> eklendi,{' '}
          <strong>{importResult.updated} güncellendi</strong>
          {(importResult.deletedDups ?? 0) > 0 && <>, <strong>{importResult.deletedDups} yinelenen</strong> temizlendi</>}.
          <button onClick={() => setImportResult(null)} className="ml-auto text-green-600 hover:text-green-900">✕</button>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 mb-5 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-600 mb-1">Ad Soyad *</label>
            <input
              value={form.adSoyad}
              onChange={(e) => setForm({ ...form, adSoyad: e.target.value })}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Öğrenci adı"
            />
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-gray-600 mb-1">Öğrenci No</label>
            <input
              value={form.ogrenciNo}
              onChange={(e) => setForm({ ...form, ogrenciNo: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Opsiyonel"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              İptal
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="İsme göre ara..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Öğrenci bulunamadı</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ad Soyad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Öğrenci No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Normalize İsim</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.adSoyad}</td>
                  <td className="px-4 py-3 text-gray-500">{s.ogrenciNo ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{s.normalizedName}</td>
                  <td className="px-4 py-3">
                    {s.aktif ? (
                      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 text-xs">
                        <UserCheck className="w-3 h-3" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 text-xs">
                        <UserX className="w-3 h-3" /> Pasif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s.id, s.adSoyad)}
                      disabled={deletingId === s.id}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {deletingId === s.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
