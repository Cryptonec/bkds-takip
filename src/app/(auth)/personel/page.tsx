'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Plus, UserCheck, UserX, X, Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface Staff {
  id: string;
  adSoyad: string;
  aktif: boolean;
  normalizedName: string;
}

interface ImportResult {
  eklenen: number;
  atlanan: number;
  hatali: number;
  toplam: number;
  formatTipi?: string;
  errors: Array<{ row: number; reason: string }>;
}

export default function PersonelPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adSoyad, setAdSoyad] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    const res = await fetch(`/api/personel?${params}`);
    if (!res.ok) { setLoading(false); return; }
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

  async function handleImport(file: File) {
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/personel/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.errors || data.eklenen !== undefined) {
        setImportResult(data);
      } else {
        setImportResult({
          eklenen: 0,
          atlanan: 0,
          hatali: 1,
          toplam: 0,
          errors: [{ row: 0, reason: data.error ?? 'Yükleme başarısız' }],
        });
      }
      load();
    } catch (err: any) {
      setImportResult({ eklenen: 0, atlanan: 0, hatali: 1, toplam: 0, errors: [{ row: 0, reason: err.message }] });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personel</h1>
          <p className="text-gray-500 text-sm mt-1">{staff.length} öğretmen / uzman</p>
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
            onClick={() => { setShowForm(!showForm); setError(''); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'İptal' : 'Personel Ekle'}
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

      {/* Format bilgisi */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800">
        <p className="flex items-center gap-1.5 font-medium mb-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Hangi dosyayı yükleyebilirsin?
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong>BRY personel listesi Excel</strong> — ADI / SOYADI kolonları otomatik tanınır</li>
          <li><strong>Lila yoklama .xls</strong> — yoklamadan personel/öğretmen isimleri çekilir</li>
          <li><strong>Standart Excel/CSV</strong> — başlık satırı: <code className="bg-blue-100 px-1 rounded">Ad Soyad</code></li>
          <li><strong>Tek sütun isim listesi</strong> — sadece adların alt alta olduğu .xlsx</li>
        </ul>
        <p className="mt-1 text-blue-600">
          Mevcut personel varsa atlanır, duplicate eklenmez. <strong>Dersi olmayan personeli</strong> de
          buradan ekleyerek BKDS girişlerinde görünür yapabilirsin.
        </p>
      </div>

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
          {error && (
            <p className="text-red-600 text-xs mt-2">{error}</p>
          )}
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
    </div>
  );
}
