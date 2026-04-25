'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, X, Pencil, Trash2, Check, Info } from 'lucide-react';

interface Staff {
  id: string;
  adSoyad: string;
  aktif: boolean;
  normalizedName: string;
}

export default function PersonelPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adSoyad, setAdSoyad] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    params.set('aktif', 'true');
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
        throw new Error(err.error ?? JSON.stringify(err));
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

  async function handleEdit(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/personel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSoyad: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Güncellenemedi');
      }
      setEditingId(null);
      setEditValue('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/personel/${id}`, { method: 'DELETE' });
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personel</h1>
          <p className="text-gray-500 text-sm mt-1">{staff.length} öğretmen / uzman</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'İptal' : 'Personel Ekle'}
        </button>
      </div>

      {/* Bilgi paneli */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium mb-0.5">Personel listesi otomatik düzenlenir</p>
          <p className="text-blue-700">
            Yoklama Excel'i içe aktarıldığında öğretmenler otomatik eklenir. <strong>Dersi olmayan
            personeli</strong> (yöneticiler, rehber, yardımcılar) buradan manuel ekleyerek BKDS
            girişlerinin sisteme yansımasını sağlayabilirsin.
          </p>
        </div>
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
                <th className="text-right px-4 py-3 font-semibold text-gray-600 w-32">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editingId === s.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEdit(s.id);
                            if (e.key === 'Escape') { setEditingId(null); setEditValue(''); }
                          }}
                          className="border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-gray-900">{s.adSoyad}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{s.normalizedName}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === s.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(s.id)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Kaydet"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditValue(''); }}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          title="İptal"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : confirmDeleteId === s.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg transition-colors"
                          title="Silmeyi onayla"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg transition-colors"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => { setEditingId(s.id); setEditValue(s.adSoyad); setError(''); }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setConfirmDeleteId(s.id); setError(''); }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && !showForm && (
        <p className="text-red-600 text-xs mt-3 text-center">{error}</p>
      )}
    </div>
  );
}
