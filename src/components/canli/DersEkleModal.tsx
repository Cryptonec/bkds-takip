'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Option { id: string; adSoyad: string }

interface DersEkleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultTarih?: string; // yyyy-mm-dd
}

export function DersEkleModal({ open, onClose, onCreated, defaultTarih }: DersEkleModalProps) {
  const [students, setStudents] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);
  const [studentId, setStudentId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [tarih, setTarih] = useState(defaultTarih ?? new Date().toISOString().slice(0, 10));
  const [baslangic, setBaslangic] = useState('09:00');
  const [bitis, setBitis] = useState('10:00');
  const [derslik, setDerslik] = useState('');
  const [bkdsRequired, setBkdsRequired] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    fetch('/api/ogrenciler?aktif=true').then(r => r.json()).then(setStudents).catch(() => {});
    fetch('/api/personel?aktif=true').then(r => r.json()).then(setStaff).catch(() => {});
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!studentId || !staffId || !derslik || !tarih) {
      setError('Tüm alanları doldurun');
      return;
    }
    setLoading(true);
    try {
      const baslangicIso = new Date(`${tarih}T${baslangic}:00`).toISOString();
      const bitisIso = new Date(`${tarih}T${bitis}:00`).toISOString();
      const res = await fetch('/api/lesson-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId, staffId, tarih, baslangic: baslangicIso, bitis: bitisIso,
          derslik, bkdsRequired,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Ders eklenemedi');
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">Yeni Ders Ekle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Öğrenci</label>
            <select value={studentId} onChange={e => setStudentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— Seçin —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.adSoyad}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Personel (Öğretmen)</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— Seçin —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.adSoyad}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Tarih</label>
            <input type="date" value={tarih} onChange={e => setTarih(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Başlangıç</label>
              <input type="time" value={baslangic} onChange={e => setBaslangic(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Bitiş</label>
              <input type="time" value={bitis} onChange={e => setBitis(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Derslik</label>
            <input type="text" value={derslik} onChange={e => setDerslik(e.target.value)}
              placeholder="A-101"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={bkdsRequired} onChange={e => setBkdsRequired(e.target.checked)} />
            BKDS girişi gerekli
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
              İptal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60">
              {loading ? 'Ekleniyor…' : 'Dersi Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
