'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Plus, UserCheck, UserX, Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface Student {
  id: string;
  adSoyad: string;
  ogrenciNo?: string;
  aktif: boolean;
  normalizedName: string;
}

interface ImportResult {
  eklenen: number;
  atlanan: number;
  hatali: number;
  toplam: number;
  errors: Array<{ row: number; reason: string }>;
}

export default function OgrencilerPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ adSoyad: '', ogrenciNo: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    const res = await fetch(`/api/ogrenciler?${params}`);
    if (!res.ok) { setLoading(false); return; }
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

  async function handleImport(file: File) {
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/ogrenciler/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ eklenen: 0, atlanan: 0, hatali: 1, toplam: 0, errors: [{ row: 0, reason: data.error ?? 'Yükleme başarısız' }] });
      } else {
        setImportResult(data);
        load();
      }
    } catch (err: any) {
      setImportResult({ eklenen: 0, atlanan: 0, hatali: 1, toplam: 0, errors: [{ row: 0, reason: err.message }] });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Öğrenciler</h1>
          <p className="text-gray-500 text-sm mt-1">{students.length} öğrenci</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Yükleniyor...' : 'Excel Yükle'}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Öğrenci Ekle
          </button>
        </div>
      </div>

      {/* Import sonucu */}
      {importResult && (
        <div className={`border rounded-xl p-4 mb-5 ${
          importResult.hatali === 0
            ? 'bg-green-50 border-green-200'
            : importResult.eklenen > 0
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {importResult.hatali === 0 ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <p className="font-semibold text-sm text-gray-900">
              {importResult.eklenen} eklendi
              {importResult.atlanan > 0 && `, ${importResult.atlanan} zaten vardı`}
              {importResult.hatali > 0 && `, ${importResult.hatali} hatalı`}
            </p>
            <button onClick={() => setImportResult(null)} className="ml-auto text-gray-400 hover:text-gray-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <div className="space-y-0.5 mt-2">
              {importResult.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-700">Satır {e.row}: {e.reason}</p>
              ))}
              {importResult.errors.length > 5 && (
                <p className="text-xs text-gray-500">... ve {importResult.errors.length - 5} hata daha</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Format bilgisi — Excel yükle butonuna basınca görünür */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800">
        <p className="flex items-center gap-1.5 font-medium mb-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel format
        </p>
        <p>
          Beklenen sütunlar: <code className="bg-blue-100 px-1 rounded">Ad Soyad</code> (zorunlu),{' '}
          <code className="bg-blue-100 px-1 rounded">Öğrenci No</code> (opsiyonel),{' '}
          <code className="bg-blue-100 px-1 rounded">TC</code> (opsiyonel). Mevcut öğrenci varsa atlanır, duplicate eklenmez.
        </p>
      </div>

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
