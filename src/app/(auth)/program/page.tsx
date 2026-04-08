'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Loader2, CalendarDays, GripVertical } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

interface Student { id: string; adSoyad: string; }
interface Lesson {
  id: string;
  student: { id: string; adSoyad: string };
  staff: { id: string; adSoyad: string };
  baslangic: string;
  bitis: string;
  derslik: string;
  bkdsRequired: boolean;
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
  const dragStudentRef = useRef<Student | null>(null);

  const weekDates = getWeekDates(weekRef);

  useEffect(() => {
    fetch('/api/ogrenciler?aktif=true')
      .then(r => r.json())
      .then(setStudents)
      .catch(() => {});
  }, []);

  const loadLessons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/program?tarih=${selectedDay}`);
      setLessons(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => { loadLessons(); }, [loadLessons]);

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
      body: JSON.stringify({
        studentId: student.id,
        tarih: selectedDay,
        baslangicSaati: slot,
        bitisSaati,
        derslik: 'Salon',
      }),
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

  // Group lessons by start-hour slot
  const lessonsBySlot = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const h = new Date(l.baslangic).getHours();
    const slotKey = `${String(h).padStart(2, '0')}:00`;
    lessonsBySlot.set(slotKey, [...(lessonsBySlot.get(slotKey) ?? []), l]);
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Left: Student list */}
      <div className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Öğrenciler</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Ara…"
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
          {filteredStudents.length === 0 && (
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
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
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
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            : <span className="text-xs text-gray-400">{lessons.length} ders</span>
          }
        </div>

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
                    {slotLessons.map(l => (
                      <div
                        key={l.id}
                        className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-3 py-2 text-xs shadow-sm group hover:bg-blue-700 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight truncate max-w-[140px]">{l.student.adSoyad}</p>
                          <p className="text-blue-200 leading-tight">
                            {formatTime(l.baslangic)}–{formatTime(l.bitis)}
                          </p>
                        </div>
                        {silConfirm === l.id ? (
                          <div className="flex items-center gap-1 ml-1">
                            <button
                              onClick={() => handleDelete(l.id)}
                              className="text-xs bg-red-500 hover:bg-red-600 text-white font-medium px-1.5 py-0.5 rounded"
                            >Sil</button>
                            <button
                              onClick={() => setSilConfirm(null)}
                              className="text-xs text-blue-200 hover:text-white px-1"
                            >İptal</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSilConfirm(l.id)}
                            className="ml-1 opacity-0 group-hover:opacity-100 text-blue-300 hover:text-white transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
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
