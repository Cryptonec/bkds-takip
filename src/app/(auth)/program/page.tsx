'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, ChevronLeft, ChevronRight, X, Loader2, CalendarDays,
  GripVertical, Home, Plus, Upload,
  CheckCircle2, XCircle, PlayCircle, TimerOff,
  Clock, Timer, MinusCircle, LogIn, LogOut,
} from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import { useLiveAttendance } from '@/lib/hooks/useLiveAttendance';
import { BildirimPanel } from '@/components/canli/BildirimPanel';
import { TumBildirimler } from '@/components/canli/TumBildirimler';

const COLORBLIND_KEY = 'program-colorblind';

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

/**
 * Renk körlüğü dostu durum bilgisi.
 * Her durum için kart rengi, ikon ve etiket döner.
 * Kırmızı-yeşil karışıklığını önlemek için tamamlandi → mavi (yeşil değil).
 */
function getStatusInfo(lesson: Lesson, evde: boolean) {
  const status = lesson.attendance?.status;
  const hasGiris = !!lesson.attendance?.gercekGiris;

  if (evde || status === 'bkds_muaf') return {
    card: 'bg-gray-400 hover:bg-gray-500 text-white',
    time: 'text-gray-200',
    btn:  'text-gray-300 hover:text-white',
    icon: <MinusCircle className="w-3.5 h-3.5 shrink-0" />,
    label: 'BKDS Muaf',
  };

  if (status === 'tamamlandi') return {
    card: 'bg-blue-600 hover:bg-blue-700 text-white',
    time: 'text-blue-200',
    btn:  'text-blue-300 hover:text-white',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    label: 'Tamamlandı',
  };

  if (status === 'erken_cikis') return {
    card: 'bg-violet-600 hover:bg-violet-700 text-white',
    time: 'text-violet-200',
    btn:  'text-violet-300 hover:text-white',
    icon: <LogOut className="w-3.5 h-3.5 shrink-0" />,
    label: 'Erken Çıkış',
  };

  if (status === 'cikis_eksik') return {
    card: 'bg-purple-600 hover:bg-purple-700 text-white',
    time: 'text-purple-200',
    btn:  'text-purple-300 hover:text-white',
    icon: <TimerOff className="w-3.5 h-3.5 shrink-0" />,
    label: 'Çıkış Eksik',
  };

  if (status === 'gec_geldi') return {
    card: 'bg-orange-500 hover:bg-orange-600 text-white',
    time: 'text-orange-100',
    btn:  'text-orange-200 hover:text-white',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
    label: 'Geç Geldi',
  };

  if (hasGiris || status === 'derste' || status === 'giris_tamam') return {
    card: 'bg-sky-600 hover:bg-sky-700 text-white',
    time: 'text-sky-200',
    btn:  'text-sky-300 hover:text-white',
    icon: <PlayCircle className="w-3.5 h-3.5 shrink-0" />,
    label: 'Derste',
  };

  if (status === 'kritik' || status === 'giris_eksik') return {
    card: 'bg-red-600 hover:bg-red-700 text-white',
    time: 'text-red-200',
    btn:  'text-red-300 hover:text-white',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
    label: status === 'kritik' ? 'Kritik!' : 'Giriş Eksik',
  };

  if (status === 'gecikiyor') return {
    card: 'bg-amber-400 hover:bg-amber-500 text-amber-900',
    time: 'text-amber-700',
    btn:  'text-amber-600 hover:text-amber-900',
    icon: <Timer className="w-3.5 h-3.5 shrink-0" />,
    label: 'Gecikiyor',
  };

  // Varsayılan: planlandı / bekleniyor
  return {
    card: 'bg-slate-500 hover:bg-slate-600 text-white',
    time: 'text-slate-300',
    btn:  'text-slate-400 hover:text-white',
    icon: <CalendarDays className="w-3.5 h-3.5 shrink-0" />,
    label: 'Planlandı',
  };
}

// Renk körlüğü dostu legend — her rengin yanında ikon var
const LEGEND = [
  { color: 'bg-slate-500',  Icon: CalendarDays,  label: 'Planlandı' },
  { color: 'bg-amber-400',  Icon: Timer,         label: 'Gecikiyor' },
  { color: 'bg-red-600',    Icon: XCircle,       label: 'Gelmedi / Kritik' },
  { color: 'bg-sky-600',    Icon: PlayCircle,    label: 'Derste' },
  { color: 'bg-orange-500', Icon: Clock,         label: 'Geç Geldi' },
  { color: 'bg-blue-600',   Icon: CheckCircle2,  label: 'Tamamlandı' },
  { color: 'bg-violet-600', Icon: LogOut,        label: 'Erken Çıkış' },
  { color: 'bg-purple-600', Icon: TimerOff,      label: 'Çıkış Eksik' },
  { color: 'bg-gray-400',   Icon: MinusCircle,   label: 'BKDS Muaf' },
];

/** G ✓ / Ç ✓ giriş-çıkış rozeti — yan yana */
function AttBadge({ att }: { att: Attendance | null }) {
  if (!att) return null;
  const giris = att.gercekGiris ? formatTime(att.gercekGiris) : null;
  const cikis = att.gercekCikis ? formatTime(att.gercekCikis) : null;
  if (!giris && !cikis) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1 whitespace-nowrap">
      {giris && (
        <span className="inline-flex items-center bg-black/20 rounded px-1 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap">
          G ✓ {giris}
        </span>
      )}
      {cikis && (
        <span className="inline-flex items-center bg-black/20 rounded px-1 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap">
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
  const [colorblind, setColorblind] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStudentRef = useRef<Student | null>(null);

  const weekDates = getWeekDates(weekRef);
  const isToday = selectedDay === todayStr();

  // Canlı bildirimler — her zaman bugünün verisi için
  const {
    data: liveData,
    yeniBildirimler, dismissBildirim,
    yeniGirisler, yeniCikislar,
    yeniPersonelGiris, yeniPersonelCikis,
  } = useLiveAttendance(undefined, 5000);

  useEffect(() => {
    const v = localStorage.getItem(COLORBLIND_KEY);
    if (v === '1') setColorblind(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(COLORBLIND_KEY, colorblind ? '1' : '0');
  }, [colorblind]);

  const loadStudents = useCallback(async () => {
    try {
      const res = await fetch('/api/ogrenciler');
      if (!res.ok) return;
      const data: Student[] = await res.json();
      const seen = new Set<string>();
      setStudents(data.filter(s => {
        const key = s.adSoyad.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    } catch {}
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

  // Bugün seçiliyse her 30 saniyede bir yenile
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(loadLessons, 30_000);
    return () => clearInterval(id);
  }, [isToday, loadLessons]);

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

  // Uyarı sayıları (bugün seçiliyse)
  const alertGelmedi = isToday
    ? visibleLessons.filter(l => ['kritik', 'giris_eksik'].includes(l.attendance?.status ?? '')).length
    : 0;
  const alertGecikiyor = isToday
    ? visibleLessons.filter(l => l.attendance?.status === 'gecikiyor').length
    : 0;
  const alertCikisEksik = isToday
    ? visibleLessons.filter(l => ['cikis_eksik', 'erken_cikis'].includes(l.attendance?.status ?? '')).length
    : 0;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Sol: Öğrenci listesi */}
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
            <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1 mb-2">
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

      {/* Sağ: Program */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-col gap-0 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-blue-600 shrink-0" />
            <h1 className="text-lg font-bold text-gray-900">Program</h1>
            <div className="h-5 w-px bg-gray-200" />

            <button onClick={() => setWeekRef(w => addWeeks(w, -1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 overflow-x-auto">
              {weekDates.map((date, i) => {
                const isTodayDate = date === todayStr();
                const isSelected = date === selectedDay;
                return (
                  <button
                    key={date}
                    onClick={() => { setSelectedDay(date); setWeekRef(date); }}
                    className={cn(
                      'flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors',
                      isSelected ? 'bg-blue-600 text-white'
                        : isTodayDate ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
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

            {/* Canlı uyarı badge'leri (sadece bugün) */}
            {alertGelmedi > 0 && (
              <span className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                <XCircle className="w-3.5 h-3.5" />
                {alertGelmedi} gelmedi
              </span>
            )}
            {alertGecikiyor > 0 && (
              <span className="flex items-center gap-1 bg-amber-400 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                <Timer className="w-3.5 h-3.5" />
                {alertGecikiyor} gecikiyor
              </span>
            )}
            {alertCikisEksik > 0 && (
              <span className="flex items-center gap-1 bg-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                <TimerOff className="w-3.5 h-3.5" />
                {alertCikisEksik} çıkış bekliyor
              </span>
            )}

            {/* Evde destek toggle */}
            {evdeCount > 0 && (
              <button
                onClick={() => setShowEvde(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0',
                  showEvde
                    ? 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                )}
              >
                <Home className="w-3.5 h-3.5" />
                Evde {showEvde ? 'Gizle' : 'Göster'}
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">
                  {evdeCount}
                </span>
              </button>
            )}

            {/* Renk körü modu toggle */}
            <button
              onClick={() => setColorblind(v => !v)}
              title="Renk körlüğüne uygun yüksek kontrast modu"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0',
                colorblind
                  ? 'bg-amber-100 border-amber-400 text-amber-800'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
            >
              <span className="flex gap-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              </span>
              Renk Körü {colorblind ? 'Açık' : 'Kapalı'}
            </button>

            {loading
              ? <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
              : <span className="text-xs text-gray-400 shrink-0">{visibleLessons.length} ders</span>
            }
          </div>
        </div>

        {/* Renk açıklamaları — her zaman üstte sabit, ikon + renk + etiket */}
        <div className="bg-white border-b border-gray-100 px-6 py-2.5 flex items-center gap-4 flex-wrap shrink-0">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide shrink-0">Renk Açıklamaları:</span>
          {LEGEND.map(({ color, Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                'rounded flex items-center justify-center text-white',
                colorblind ? 'w-7 h-7 ring-2 ring-black/40' : 'w-5 h-5',
                color,
              )}>
                <Icon className={colorblind ? 'w-4 h-4' : 'w-3 h-3'} />
              </span>
              <span className={cn('text-gray-700', colorblind ? 'text-sm font-semibold' : 'text-xs')}>{label}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 shrink-0 ml-2 pl-3 border-l border-gray-200">
            <span className={cn(
              'rounded ring-2 ring-emerald-500 bg-white',
              colorblind ? 'w-7 h-7' : 'w-5 h-5',
            )} />
            <span className={cn('text-gray-700', colorblind ? 'text-sm font-semibold' : 'text-xs')}>
              Yeşil halka = Giriş yaptı
            </span>
          </span>
        </div>

        {/* Toplu bildirimler paneli — sadece bugün */}
        {isToday && liveData && liveData.bildirimler.length > 0 && (
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 shrink-0">
            <TumBildirimler bildirimler={liveData.bildirimler} />
          </div>
        )}

        {/* Zaman tablosu */}
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
                  {/* Saat etiketi */}
                  <div className="w-12 shrink-0 flex items-start pt-1">
                    <span className="text-xs font-mono text-gray-400 font-semibold">{slot}</span>
                  </div>

                  {/* Dersler + bırakma ipucu */}
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
                      const si = getStatusInfo(l, evde);
                      const hasGiris = !!l.attendance?.gercekGiris;
                      return (
                        <div
                          key={l.id}
                          className={cn(
                            'flex items-start gap-2 rounded-lg px-3 py-2 text-xs shadow-sm group transition-colors',
                            si.card,
                            hasGiris && 'ring-2 ring-emerald-400 ring-offset-1',
                            colorblind && 'border-2 border-black/30',
                          )}
                        >
                          <div className="min-w-0">
                            {/* İsim + ikon */}
                            <div className="flex items-center gap-1 mb-0.5">
                              {evde
                                ? <Home className="w-3 h-3 shrink-0 opacity-80" />
                                : si.icon
                              }
                              <p className="font-semibold leading-tight truncate max-w-[130px]">{l.student.adSoyad}</p>
                            </div>
                            {/* Durum etiketi */}
                            <p className={cn('text-[10px] font-medium opacity-80 leading-tight', si.time)}>
                              {si.label}
                            </p>
                            {/* Saat */}
                            <p className={cn('leading-tight mt-0.5', si.time)}>
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
                                className={cn('text-xs px-1', si.btn)}
                              >İptal</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSilConfirm(l.id)}
                              className={cn('mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity', si.btn)}
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

      {/* Giriş/çıkış toast bildirimleri — sol alt köşe */}
      {(yeniGirisler.length > 0 || yeniCikislar.length > 0 || yeniPersonelGiris.length > 0 || yeniPersonelCikis.length > 0) && (
        <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2 max-w-xs">
          {yeniGirisler.map(r => (
            <div key={r.ogrenciId} className="flex items-center gap-2 bg-sky-600 text-white rounded-xl px-4 py-2.5 shadow-lg text-sm font-medium">
              <LogIn className="w-4 h-4 shrink-0" />
              <span className="truncate">{r.ogrenciAdi} giriş yaptı</span>
              {r.gercekGiris && <span className="text-sky-200 text-xs shrink-0">{formatTime(r.gercekGiris)}</span>}
            </div>
          ))}
          {yeniCikislar.map(r => (
            <div key={r.ogrenciId} className="flex items-center gap-2 bg-orange-500 text-white rounded-xl px-4 py-2.5 shadow-lg text-sm font-medium">
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="truncate">{r.ogrenciAdi} çıkış yaptı</span>
              {r.gercekCikis && <span className="text-orange-100 text-xs shrink-0">{formatTime(r.gercekCikis)}</span>}
            </div>
          ))}
          {yeniPersonelGiris.map(p => (
            <div key={p.id} className="flex items-center gap-2 bg-blue-700 text-white rounded-xl px-4 py-2.5 shadow-lg text-sm font-medium">
              <LogIn className="w-4 h-4 shrink-0" />
              <span className="truncate">{p.ad} göreve geldi</span>
            </div>
          ))}
          {yeniPersonelCikis.map(p => (
            <div key={p.id} className="flex items-center gap-2 bg-indigo-600 text-white rounded-xl px-4 py-2.5 shadow-lg text-sm font-medium">
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="truncate">{p.ad} görevden ayrıldı</span>
            </div>
          ))}
        </div>
      )}

      {/* Uyarı bildirimleri (gelmedi / yaklaşan / erken çıkış) — sağ alt köşe */}
      <BildirimPanel bildirimler={yeniBildirimler} onDismiss={dismissBildirim} />
    </div>
  );
}
