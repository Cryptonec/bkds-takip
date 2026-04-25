'use client';
import { useEffect, useState } from 'react';
import { X, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option { id: string; adSoyad: string }

interface DersEkleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const SAATLER = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const TEK_DERS_DK = 40;
const IKILI_DERS_DK = 80;

export function DersEkleModal({ open, onClose, onCreated }: DersEkleModalProps) {
  const [students, setStudents] = useState<Option[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [saat, setSaat] = useState<number | null>(null);
  const [ikili, setIkili] = useState(false);
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

  function reset() {
    setStudentId('');
    setSaat(null);
    setIkili(false);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!studentId) return setError('Öğrenci seçilmeli');
    if (saat == null) return setError('Saat seçilmeli');

    setLoading(true);
    try {
      const tarih = new Date().toISOString().slice(0, 10);
      const baslangic = new Date(`${tarih}T${String(saat).padStart(2, '0')}:00:00`);
      const sureDk = ikili ? IKILI_DERS_DK : TEK_DERS_DK;
      const bitis = new Date(baslangic.getTime() + sureDk * 60_000);

      const res = await fetch('/api/lesson-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          tarih,
          baslangic: baslangic.toISOString(),
          bitis: bitis.toISOString(),
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
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  const sureDk = ikili ? IKILI_DERS_DK : TEK_DERS_DK;
  const bitisSaat = saat != null
    ? (() => {
        const dk = saat * 60 + sureDk;
        const h = Math.floor(dk / 60);
        const m = dk % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      })()
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">Yeni Ders Ekle</h2>
          <button onClick={() => { reset(); onClose(); }} className="text-gray-400 hover:text-gray-700 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Öğrenci */}
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm touch-manipulation"
                autoFocus
              >
                <option value="">— Seçin —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.adSoyad}</option>)}
              </select>
            )}
          </div>

          {/* Saat butonları */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Başlangıç Saati</label>
            <div className="grid grid-cols-6 gap-1.5">
              {SAATLER.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSaat(s)}
                  className={cn(
                    'h-11 rounded-lg border text-sm font-bold tabular-nums transition-colors touch-manipulation select-none',
                    saat === s
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 active:bg-blue-50',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* İkili ders toggle */}
          <button
            type="button"
            onClick={() => setIkili(v => !v)}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border-2 transition-colors touch-manipulation',
              ikili
                ? 'bg-purple-50 border-purple-400 text-purple-800'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-400',
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="font-semibold text-sm">İkili Ders (80 dk)</span>
            </div>
            <span
              className={cn(
                'inline-flex items-center w-10 h-6 rounded-full p-0.5 transition-colors',
                ikili ? 'bg-purple-600' : 'bg-gray-300',
              )}
            >
              <span
                className={cn(
                  'w-5 h-5 rounded-full bg-white shadow transition-transform',
                  ikili && 'translate-x-4',
                )}
              />
            </span>
          </button>

          {/* Özet */}
          {saat != null && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-900">
              <span className="font-bold tabular-nums">
                {String(saat).padStart(2, '0')}:00 – {bitisSaat}
              </span>
              <span className="text-xs text-blue-700 ml-2">
                ({sureDk} dk)
              </span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}

          <p className="text-xs text-gray-500">Tarih bugün olarak atanır. Derslik ve öğretmen otomatik 'Belirtilmemiş' olarak kaydedilir.</p>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 text-sm font-medium touch-manipulation"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || students.length === 0 || !studentId || saat == null}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium disabled:opacity-60 touch-manipulation"
            >
              {loading ? 'Ekleniyor…' : 'Dersi Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
