'use client';
import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface Option { id: string; adSoyad: string }

interface DersEkleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function DersEkleModal({ open, onClose, onCreated }: DersEkleModalProps) {
  const [students, setStudents] = useState<Option[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [baslangic, setBaslangic] = useState('09:00');
  const [bitis, setBitis] = useState('10:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStudentsLoading(true);
    fetch('/api/ogrenciler?aktif=true')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setStudents(data);
        else setStudents([]);
      })
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!studentId || !baslangic || !bitis) {
      setError('Öğrenci ve saat zorunlu');
      return;
    }
    setLoading(true);
    try {
      // Tarih = bugün (otomatik)
      const tarih = new Date().toISOString().slice(0, 10);
      const baslangicIso = new Date(`${tarih}T${baslangic}:00`).toISOString();
      const bitisIso = new Date(`${tarih}T${bitis}:00`).toISOString();
      const res = await fetch('/api/lesson-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          tarih,
          baslangic: baslangicIso,
          bitis: bitisIso,
          // staffId ve derslik opsiyonel — backend default atar
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'string'
          ? data.error
          : data?.error?.fieldErrors
            ? Object.entries(data.error.fieldErrors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
            : 'Ders eklenemedi';
        setError(msg);
        return;
      }
      // Başarılı — state sıfırla, modali kapat
      setStudentId('');
      setBaslangic('09:00');
      setBitis('10:00');
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">Yeni Ders Ekle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Öğrenci</label>
            {studentsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg bg-gray-50">
                <Loader2 className="w-4 h-4 animate-spin" /> Öğrenciler yükleniyor…
              </div>
            ) : students.length === 0 ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Kayıtlı öğrenci yok. Önce Öğrenciler sekmesinden Excel yükleyin veya manuel ekleyin.
              </div>
            ) : (
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                autoFocus
              >
                <option value="">— Seçin —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.adSoyad}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Başlangıç</label>
              <input
                type="time"
                value={baslangic}
                onChange={e => setBaslangic(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Bitiş</label>
              <input
                type="time"
                value={bitis}
                onChange={e => setBitis(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">Tarih bugün olarak atanır. Derslik ve öğretmen otomatik 'Belirtilmemiş' olarak kaydedilir.</p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || students.length === 0}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
            >
              {loading ? 'Ekleniyor…' : 'Dersi Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
