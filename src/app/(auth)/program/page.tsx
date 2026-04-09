'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Loader2, CalendarDays, GripVertical, Home, Plus, Upload } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

interface Student { id: string; adSoyad: string; }
interface Attendance {
  status: string;
  gercekGiris: string | null;
  gercekCikis: string | null;
}
interface Lesson {
  id: string;
  student: { id: string; adSoyad: string };
  staff: { id: string; adSoyad: string };
  baslangic: string;
  bitis: string;
  derslik: string;
  bkdsRequired: boolean;
  attendance: Attendance | null;
}

const TIME_SLOTS = Array.from({ length: 13 }, (_, i) => {
  const h = 8 + i;
  return `${String(h).padStart(2, '0')}:00`;
}); // 08:00 … 20:00

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDates(refDate: string): string[] {
  const d = new Date(refDate + 'T00:00:00');
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd.toISOString().slice(0, 10);
  });
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function fmtShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function isEvdeDestek(lesson: Lesson) {
  return !lesson.bkdsRequired || lesson.derslik.toLowerCase().includes('evde destek');
}

/** Devam durumuna göre kart rengi */
function getLessonColors(lesson: Lesson, evde: boolean) {
  if (evde) return {
    card: 'bg-amber-500 hover:bg-amber-600 text-white',
    time: 'text-amber-100',
    btn: 'text-amber-200 hover:text-white',
  };

  const status = lesson.attendance?.status;
  const hasGiris = !!lesson.attendance?.gercekGiris;

  // Tamamlandı: nizami giriş + çıkış
  if (status === 'tamamlandi') return {
    card: 'bg-green-600 hover:bg-green-700 text-white',
    time: 'text-green-200',
    btn: 'text-green-300 hover:text-white',
  };
  // Erken çıkış
  if (status === 'erken_cikis') return {
    card: 'bg-orange-500 hover:bg-orange-600 text-white',
    time: 'text-orange-100',
    btn: 'text-orange-200 hover:text-white',
  };
  // Çıkış kaydı eksik (girdi ama çıkış yok, ders bitti)
  if (status === 'cikis_eksik') return {
    card: 'bg-purple-600 hover:bg-purple-700 text-white',
    time: 'text-purple-200',
    btn: 'text-purple-300 hover:text-white',
  };
  // Derste / geç geldi (giriş var, ders devam ediyor)
  if (hasGiris || status === 'derste' || status === 'giris_tamam' || status === 'gec_geldi') return {
    card: 'bg-teal-600 hover:bg-teal-700 text-white',
    time: 'text-teal-200',
    btn: 'text-teal-300 hover:text-white',
  };
  // Gelmedi / kritik
  if (status === 'kritik' || status === 'giris_eksik') return {
    card: 'bg-red-600 hover:bg-red-700 text-white',
    time: 'text-red-200',
    btn: 'text-red-300 hover:text-white',
  };
  // Gecikiyor (az gecikmiş, henüz kritik değil)
  if (status === 'gecikiyor') return {
    card: 'bg-yellow-400 hover:bg-yellow-500 text-yellow-900',
    time: 'text-yellow-700',
    btn: 'text-yellow-600 hover:text-yellow-900',
  };
  // BKDS muaf
  if (status === 'bkds_muaf') return {
    card: 'bg-gray-400 hover:bg-gray-500 text-white',
    time: 'text-gray-200',
    btn: 'text-gray-300 hover:text-white',
  };
  // Varsayılan: planlandı / bekliyor
  return {
    card: 'bg-blue-600 hover:bg-blue-700 text-white',
    time: 'text-blue-200',
    btn: 'text-blue-300 hover:text-white',
  };
}

const LEGEND = [
  { color: 'bg-blue-600',   label: 'Planlandı' },
  { color: 'bg-yellow-400', label: 'Gecikiyor',      textCls: 'text-yellow-900' },
  { color: 'bg-red-600',    label: 'Gelmedi' },
  { color: 'bg-teal-600',   label: 'Derste' },
  { color: 'bg-green-600',  label: 'Tamamlandı' },
  { color: 'bg-orange-500', label: 'Erken çıkış' },
  { color: 'bg-purple-600', label: 'Çıkış eksik' },
  { color: 'bg-gray-400',   label: 'BKDS muaf' },
  { color: 'bg-amber-500',  label: 'Evde destek' },
];

/** G ✓ / Ç ✓ giriş-çıkış rozeti */
function AttBadge({ att }: { att: Attendance | null }) {
  if (!att) return null;
  const giris = att.gercekGiris ? formatTime(att.gercekGiris) : null;
  const cikis = att.gercekCikis ? formatTime(att.gercekCikis) : null;
  if (!giris && !cikis) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      {giris && (
        <span className="flex items-center gap-0.5 bg-black/20 rounded px-1 py-0.5 text-[10px] font-semibold leading-none">
          G ✓ {giris}
        </span>
      )}
      {cikis && (
        <span className="flex items-center gap-0.5 bg-black/20 rounded px-1 py-0.5 text-[10px] font-semibold leading-none">
          Ç ✓ {cikis}
        </span>
      )}
    </div>
  );
}

export default function ProgramPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [weekRef, setWeekRef] = useState(todayStr);
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [silConfirm, setSilConfirm] = useState<string | null>(null);
  const [showEvde, setShowEvde] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStudentRef = useRef<Student | null>(null);

  const weekDates = getWeekDates(weekRef);

  const loadStudents = useCallback(async () => {
    const res = await fetch('/api/ogrenciler');
    const data: Student[] = await res.json();
    const seen = new Set<string>();
    setStudents(data.filter(s => {
      const key = s.adSoyad.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  async function addStudent(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAddingStudent(true);
    const res = await fetch('/api/ogrenciler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adSoyad: trimmed }),
    });
    if (res.ok) {
      setStudentSearch('');
      await loadStudents();
    }
    setAddingStudent(false);
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
      if (!res.ok) { alert(data.error ?? 'Hata oluştu'); return; }
      setImportResult({ created: data.created ?? 0, updated: data.updated ?? 0 });
      await loadStudents();
    } catch {
      alert('Dosya gönderilemedi.');
    } finally {
      setImporting(false);
    }
  }

  const loadLessons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/program?tarih=${selectedDay}`);
      const data = await res.json();
      setLessons(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => { loadLessons(); }, [loadLessons]);

  useEffect(() => {
    if (selectedDay !== todayStr()) return;
    const id = setInterval(loadLessons, 30_000);
    return () => clearInterval(id);
  }, [selectedDay, loadLessons]);

  const filteredStudents = students.filter(s =>
    !studentSearch || s.adSoyad.toLowerCase().includes(studentSearch.toLowerCase())
  );

  async function handleDrop(slot: string) {
    const student = dragStudentRef.current;
    setDragOver(null);
    if (!student) return;
    setSaving(slot);
    const [h, m] = slot.split(':').map(Number);
    const endMin = h * 60 + m + 40;
    const bitisSaati = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    await fetch('/api/program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, tarih: selectedDay, baslangicSaati: slot, bitisSaati, derslik: 'Salon' }),
    });
    setSaving(null);
    dragStudentRef.current = null;
    loadLessons();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/program/${id}`, { method: 'DELETE' });
    setSilConfirm(null);
    loadLessons();
  }

  const visibleLessons = showEvde ? lessons : lessons.filter(l => !isEvdeDestek(l));
  const lessonsBySlot = new Map<string, Lesson[]>();
  for (const l of visibleLessons) {
    const h = new Date(l.baslangic).getHours();
    const slotKey = `${String(h).padStart(2, '0')}:00`;
    lessonsBySlot.set(slotKey, [...(lessonsBySlot.get(slotKey) ?? []), l]);
  }
  const evdeCount = lessons.filter(isEvdeDestek).length;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Left: Student list */}
      <div className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Öğrenciler</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {studentSearch ? `${filteredStudents.length} / ${students.length}` : students.length}
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                title="Excel/CSV'den öğrenci listesi içe aktar"
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.html,.htm" className="hidden" onChange={handleImportFile} />
            </div>
          </div>
          {importResult && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-2 py-1 mb-2">
              ✓ {importResult.created} yeni, {importResult.updated} güncellendi
            </p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && studentSearch.trim() && filteredStudents.length === 0) addStudent(studentSearch);
              }}
              placeholder="Ara veya yeni ekle…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredStudents.map(s => (
            <div
              key={s.id}
              draggable
              onDragStart={() => { dragStudentRef.current = s; }}
              onDragEnd={() => { if (!dragOver) dragStudentRef.current = null; }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50 cursor-grab active:cursor-grabbing text-sm text-gray-700 select-none transition-colors group"
            >
              <GripVertical className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0" />
              <span className="truncate">{s.adSoyad}</span>
            </div>
          ))}
          {filteredStudents.length === 0 && studentSearch.trim().length > 1 && (
            <button
              onClick={() => addStudent(studentSearch)}
              disabled={addingStudent}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 text-sm transition-colors disabled:opacity-50"
            >
              {addingStudent ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Plus className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">"{studentSearch.trim()}" ekle</span>
            </button>
          )}
          {filteredStudents.length === 0 && studentSearch.trim().length <= 1 && (
            <p className="text-xs text-gray-400 text-center py-10">Öğrenci bulunamadı</p>
          )}
        </div>
      </div>

      {/* Right: Schedule */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0 shadow-sm">
          <CalendarDays className="w-5 h-5 text-blue-600 shrink-0" />
          <h1 className="text-lg font-bold text-gray-900">Program</h1>
          <div className="h-5 w-px bg-gray-200" />

          <button onClick={() => setWeekRef(w => addWeeks(w, -1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 overflow-x-auto">
            {weekDates.map((date, i) => {
              const isToday = date === todayStr();
              const isSelected = date === selectedDay;
              return (
                <button
                  key={date}
                  onClick={() => { setSelectedDay(date); setWeekRef(date); }}
                  className={cn(
                    'flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors',
                    isSelected ? 'bg-blue-600 text-white'
                      : isToday ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      : 'text-gray-500 hover:bg-gray-100'
                  )}
                >
                  <span>{DAY_LABELS[i]}</span>
                  <span className={cn('mt-0.5', isSelected ? 'text-blue-200' : 'text-gray-400')}>{fmtShort(date)}</span>
                </button>
              );
            })}
          </div>

          <button onClick={() => setWeekRef(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0">
            <ChevronRight className="w-4 h-4" />
          </button>

          {!weekDates.includes(todayStr()) && (
            <button onClick={() => { setWeekRef(todayStr()); setSelectedDay(todayStr()); }}
              className="text-xs text-blue-600 hover:underline font-medium shrink-0">Bugün</button>
          )}

          <div className="flex-1" />

          {/* Evde destek toggle */}
          {evdeCount > 0 && (
            <button
              onClick={() => setShowEvde(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0',
                showEvde
                  ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                  : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200'
              )}
            >
              <Home className="w-3.5 h-3.5" />
              Evde Destek {showEvde ? 'Gizle' : 'Göster'}
              <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                showEvde ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-500'
              )}>{evdeCount}</span>
            </button>
          )}

          {/* Renk açıklaması toggle */}
          <button
            onClick={() => setShowLegend(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0',
              showLegend
                ? 'bg-gray-100 border-gray-300 text-gray-700'
                : 'border-gray-200 text-gray-400 hover:bg-gray-50'
            )}
          >
            <span className="flex gap-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" />
            </span>
            Renkler
          </button>

          {loading
            ? <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
            : <span className="text-xs text-gray-400 shrink-0">{visibleLessons.length} ders</span>
          }
        </div>

        {/* Renk açıklamaları */}
        {showLegend && (
          <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-3 flex-wrap shrink-0">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Renk Açıklaması:</span>
            {LEGEND.map(({ color, label, textCls }) => (
              <span key={label} className="flex items-center gap-1.5 shrink-0">
                <span className={cn('w-3 h-3 rounded-sm shrink-0', color)} />
                <span className="text-xs text-gray-600">{label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Time grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-4 space-y-1">
            {TIME_SLOTS.map(slot => {
              const slotLessons = lessonsBySlot.get(slot) ?? [];
              const isDragOver = dragOver === slot;
              const isSaving   = saving === slot;

              return (
                <div
                  key={slot}
                  onDragOver={e => { e.preventDefault(); setDragOver(slot); }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOver(d => d === slot ? null : d);
                    }
                  }}
                  onDrop={e => { e.preventDefault(); handleDrop(slot); }}
                  className={cn(
                    'flex gap-3 rounded-xl border-2 transition-all duration-150 px-3 py-2 min-h-[52px]',
                    isDragOver
                      ? 'border-blue-400 bg-blue-50 shadow-inner'
                      : slotLessons.length > 0
                      ? 'border-gray-100 bg-white shadow-sm hover:border-gray-200'
                      : 'border-dashed border-gray-200 hover:border-gray-300 bg-transparent'
                  )}
                >
                  {/* Time label */}
                  <div className="w-12 shrink-0 flex items-start pt-1">
                    <span className="text-xs font-mono text-gray-400 font-semibold">{slot}</span>
                  </div>

                  {/* Lessons + drop hint */}
                  <div className="flex-1 flex flex-wrap gap-2 items-start min-w-0">
                    {isDragOver && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 text-blue-500 text-xs font-medium">
                        Buraya bırak
                      </div>
                    )}
                    {isSaving && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Kaydediliyor…
                      </div>
                    )}
                    {slotLessons.map(l => {
                      const evde = isEvdeDestek(l);
                      const colors = getLessonColors(l, evde);
                      return (
                        <div
                          key={l.id}
                          className={cn(
                            'flex items-start gap-2 rounded-lg px-3 py-2 text-xs shadow-sm group transition-colors',
                            colors.card
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              {evde && <Home className="w-3 h-3 shrink-0 opacity-80" />}
                              <p className="font-semibold leading-tight truncate max-w-[140px]">{l.student.adSoyad}</p>
                            </div>
                            <p className={cn('leading-tight', colors.time)}>
                              {formatTime(l.baslangic)}–{formatTime(l.bitis)}
                            </p>
                            <AttBadge att={l.attendance} />
                          </div>
                          {silConfirm === l.id ? (
                            <div className="flex items-center gap-1 ml-1 mt-0.5">
                              <button
                                onClick={() => handleDelete(l.id)}
                                className="text-xs bg-red-500 hover:bg-red-600 text-white font-medium px-1.5 py-0.5 rounded"
                              >Sil</button>
                              <button
                                onClick={() => setSilConfirm(null)}
                                className={cn('text-xs px-1', colors.btn)}
                              >İptal</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSilConfirm(l.id)}
                              className={cn('mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity', colors.btn)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
