'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Plus, UserCheck, UserX, Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, Pencil, Trash2, Check, X } from 'lucide-react';

interface Student {
  id: string;
  adSoyad: string;
  ogrenciNo?: string | null;
  tc?: string | null;
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

interface EditState {
  id: string;
  adSoyad: string;
  ogrenciNo: string;
  tc: string;
}

export default function OgrencilerPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ adSoyad: '', ogrenciNo: '', tc: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    params.set('aktif', 'true');
    const res = await fetch(`/api/ogrenciler?${params}`);
    if (!res.ok) { setLoading(false); return; }
    setStudents(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/ogrenciler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adSoyad: form.adSoyad.trim(),
          ogrenciNo: form.ogrenciNo.trim() || undefined,
          tc: form.tc.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.fieldErrors ? JSON.stringify(err.error.fieldErrors) : err.error ?? 'Eklenemedi');
      }
      setForm({ adSoyad: '', ogrenciNo: '', tc: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editing) return;
    setError('');
    try {
      const res = await fetch(`/api/ogrenciler/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adSoyad: editing.adSoyad.trim(),
          ogrenciNo: editing.ogrenciNo.trim(),
          tc: editing.tc.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Güncellenemedi');
      }
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/ogrenciler/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Silinemedi');
      }
      setConfirmDeleteId(null);
      load();
    } catch (err: any) {
      setError(err.message);
    }
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
    <div className="p-6 max-w-5xl mx-auto">
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
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors touch-manipulation"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Yükleniyor...' : 'Excel Yükle'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setError(''); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors touch-manipulation"
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

      {/* Format bilgisi */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800">
        <p className="flex items-center gap-1.5 font-medium mb-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Hangi dosyayı yükleyebilirsin?
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong>BRY öğrenci listesi Excel</strong> — ADI / SOYADI / T.C. KİMLİK NO / ÖĞRENCİ NO kolonları otomatik tanınır, başlık satırları atlanır</li>
          <li><strong>Lila yoklama .xls</strong> — yoklamadan öğrenci isimleri çekilir (her öğrenci tek kez)</li>
          <li><strong>Standart Excel/CSV</strong> — başlık satırı: <code className="bg-blue-100 px-1 rounded">Ad Soyad</code></li>
          <li><strong>Tek sütun isim listesi</strong> — sadece adların alt alta olduğu .xlsx</li>
        </ul>
        <p className="mt-1 text-blue-600">
          <strong>TC ipucu:</strong> Aynı isim prefix+suffix'inde iki öğrenci varsa (örn. MUH...NAR ile MUHSİN ÜÇPINAR ve MUHAMMED YANAR), BKDS doğru kişiyi seçemez. Öğrencinin TC'sinin <strong>en az son 4 hanesini</strong> ekle, sistem ayrıştırsın.
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
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-gray-600 mb-1">TC (son 4 hane yeter)</label>
            <input
              value={form.tc}
              onChange={(e) => setForm({ ...form, tc: e.target.value.replace(/\D/g, '').slice(0, 11) })}
              inputMode="numeric"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="örn: 0666"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg transition-colors touch-manipulation"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); }}
              className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            >
              İptal
            </button>
          </div>
          {error && (
            <p className="text-red-600 text-xs w-full">{error}</p>
          )}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">TC</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 w-32">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map((s) => {
                const isEditing = editing?.id === s.id;
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editing!.adSoyad}
                          onChange={(e) => setEditing({ ...editing!, adSoyad: e.target.value })}
                          className="w-full border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <>
                          <p className="font-medium text-gray-900">{s.adSoyad}</p>
                          <p className="text-xs text-gray-400 font-mono">{s.normalizedName}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {isEditing ? (
                        <input
                          value={editing!.ogrenciNo}
                          onChange={(e) => setEditing({ ...editing!, ogrenciNo: e.target.value })}
                          className="w-24 border border-blue-300 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="—"
                        />
                      ) : (s.ogrenciNo ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-700 tabular-nums">
                      {isEditing ? (
                        <input
                          value={editing!.tc}
                          onChange={(e) => setEditing({ ...editing!, tc: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                          inputMode="numeric"
                          className="w-28 border border-blue-300 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0666"
                        />
                      ) : s.tc ? (
                        <span className="text-xs">{s.tc.length === 11 ? `*******${s.tc.slice(-4)}` : s.tc}</span>
                      ) : (
                        <span className="text-amber-600 text-xs italic">eksik</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={handleEditSave}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors touch-manipulation"
                            title="Kaydet"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                            title="İptal"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : confirmDeleteId === s.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg transition-colors touch-manipulation"
                          >
                            Sil
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg transition-colors touch-manipulation"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditing({
                                id: s.id,
                                adSoyad: s.adSoyad,
                                ogrenciNo: s.ogrenciNo ?? '',
                                tc: s.tc ?? '',
                              });
                              setError('');
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors touch-manipulation"
                            title="Düzenle"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setConfirmDeleteId(s.id); setError(''); }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {error && !showForm && !editing && (
        <p className="text-red-600 text-xs mt-3 text-center">{error}</p>
      )}
    </div>
  );
}
