'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { UserCheck, LogOut, Volume2, VolumeX, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface Kayit {
  id: string;
  tip: 'giris' | 'cikis';
  tur: 'ogrenci' | 'personel';
  ad: string;
  saat: string;
  ts: number;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function cozIsim(k: string, ad: string): string {
  if (!ad.includes('*')) return ad;
  if (typeof window === 'undefined') return ad;
  return localStorage.getItem(`pname_${k}_${ad.substring(0, 4)}`) ?? ad;
}

// Paylaşılan AudioContext — arka sekme de dahil çalışır
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioCtx;
}

// Sıralı konuşma kuyruğu — sesler üst üste binmez
const speechQueue: string[] = [];
let speechBusy = false;
let speechWatchdog: ReturnType<typeof setTimeout> | null = null;

function pumpSpeech() {
  if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
  if (speechQueue.length === 0) { speechBusy = false; return; }
  if (document.hidden) { speechBusy = false; return; }
  if (!('speechSynthesis' in window)) { speechQueue.length = 0; speechBusy = false; return; }
  speechBusy = true;
  const text = speechQueue.shift()!;
  const utt = new SpeechSynthesisUtterance(text.toLocaleLowerCase('tr-TR'));
  utt.lang = 'tr-TR';
  utt.rate = 1.05;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const trVoice = voices.find(v => v.lang.startsWith('tr'));
  if (trVoice) utt.voice = trVoice;
  const next = () => {
    if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
    setTimeout(pumpSpeech, 100);
  };
  utt.onend  = next;
  utt.onerror = next;
  speechWatchdog = setTimeout(next, 5000);
  window.speechSynthesis.speak(utt);
}

function queueSpeech(text: string) {
  if (!text || text.includes('*')) return;
  if (speechQueue.length >= 3) speechQueue.shift();
  speechQueue.push(text);
  if (!speechBusy) pumpSpeech();
}

function beepGiris() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const g = ctx.createGain();
    g.connect(ctx.destination);
    [880, 1100].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(g);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t); o.stop(t + 0.16);
    });
  } catch {}
}

function beepCikis() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const g = ctx.createGain();
    g.connect(ctx.destination);
    [660, 440].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(g);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t); o.stop(t + 0.16);
    });
  } catch {}
}

function useBildirimEkrani(sesAcik: boolean) {
  const girisMapRef = useRef<Map<string, Kayit>>(new Map());
  const cikisMapRef = useRef<Map<string, Kayit>>(new Map());
  const [girisler, setGirisler] = useState<Kayit[]>([]);
  const [cikislar, setCikislar] = useState<Kayit[]>([]);
  const [sonGuncelleme, setSonGuncelleme] = useState('');
  const [hata, setHata] = useState(false);
  const [sseAktif, setSseAktif] = useState(false);
  const sonBasariRef = useRef<number>(0);
  const sesAcikRef = useRef(sesAcik);
  const isFirst = useRef(true);
  // Sayfa açılış zamanı — geçmiş kayıtların seslendirilmesini engeller
  const pageLoadTime = useRef<number>(Date.now());

  useEffect(() => { sesAcikRef.current = sesAcik; }, [sesAcik]);

  // ── Veri işleme: hem SSE hem fallback fetch bu fonksiyonu kullanır ──
  const processData = useCallback((json: any) => {
    const bkdsKayitlar: any[] = json.bkdsOgrenciKayitlari ?? [];
    const personelRows: any[] = json.personelRows ?? [];
    const tumPersonel: any[] = json.tumPersonelGirisler ?? [];

    const anlikGirisler: Kayit[] = [];
    const anlikCikislar: Kayit[] = [];

    // Öğrenci girişleri
    bkdsKayitlar.filter((b: any) => b.ilkGiris).forEach((b: any) => {
      anlikGirisler.push({ id: `bg-${b.id}`, tip: 'giris', tur: 'ogrenci',
        ad: b.adSoyad, saat: fmt(b.ilkGiris), ts: new Date(b.ilkGiris).getTime() });
    });
    bkdsKayitlar.filter((b: any) => b.sonCikis).forEach((b: any) => {
      anlikCikislar.push({ id: `bc-${b.id}`, tip: 'cikis', tur: 'ogrenci',
        ad: b.adSoyad, saat: fmt(b.sonCikis), ts: new Date(b.sonCikis).getTime() });
    });

    // Personel girişleri
    const pgKeys = new Set<string>();
    personelRows.filter((r: any) => r.baslamaZamani).forEach((r: any) => {
      pgKeys.add(r.staffId);
      anlikGirisler.push({ id: `pg-${r.staffId}`, tip: 'giris', tur: 'personel',
        ad: r.ogretmenAdi, saat: fmt(r.baslamaZamani), ts: new Date(r.baslamaZamani).getTime() });
    });
    tumPersonel.forEach((p: any) => {
      const k = p.staffId ?? p.ogretmenAdi;
      if (!pgKeys.has(k) && p.ilkGiris) {
        const ad = cozIsim(k, p.ogretmenAdi);
        anlikGirisler.push({ id: `tp-${k}`, tip: 'giris', tur: 'personel',
          ad, saat: fmt(p.ilkGiris), ts: new Date(p.ilkGiris).getTime() });
      }
    });

    // Personel çıkışları
    const pcKeys = new Set<string>();
    personelRows.filter((r: any) => r.sonCikisZamani).forEach((r: any) => {
      pcKeys.add(r.staffId);
      anlikCikislar.push({ id: `pc-${r.staffId}`, tip: 'cikis', tur: 'personel',
        ad: r.ogretmenAdi, saat: fmt(r.sonCikisZamani), ts: new Date(r.sonCikisZamani).getTime() });
    });
    tumPersonel.filter((p: any) => p.sonCikis).forEach((p: any) => {
      const k = p.staffId ?? p.ogretmenAdi;
      if (!pcKeys.has(k)) {
        const ad = cozIsim(k, p.ogretmenAdi);
        anlikCikislar.push({ id: `tpc-${k}`, tip: 'cikis', tur: 'personel',
          ad, saat: fmt(p.sonCikis), ts: new Date(p.sonCikis).getTime() });
      }
    });

    // Yeni girişleri bul
    const newGirisler: Kayit[] = [];
    anlikGirisler.forEach(k => {
      if (!girisMapRef.current.has(k.ad)) {
        girisMapRef.current.set(k.ad, k);
        newGirisler.push(k);
      }
    });

    const newCikislar: Kayit[] = [];
    anlikCikislar.forEach(k => {
      const existing = cikisMapRef.current.get(k.ad);
      if (!existing || existing.ts < k.ts) {
        cikisMapRef.current.set(k.ad, k);
        newCikislar.push(k);
      }
    });

    const sortedG = [...girisMapRef.current.values()].sort((a, b) => b.ts - a.ts);
    const sortedC = [...cikisMapRef.current.values()].sort((a, b) => b.ts - a.ts);

    // Sadece sayfa açıldıktan SONRA gerçekleşen kayıtlar seslendirilir
    const anonsKesim = pageLoadTime.current;

    if (isFirst.current) {
      setGirisler(sortedG);
      setCikislar(sortedC);
      isFirst.current = false;
    } else {
      if (newGirisler.length > 0) {
        setGirisler(sortedG);
        if (sesAcikRef.current) {
          const anons = newGirisler.filter(k => k.ts >= anonsKesim).sort((a, b) => a.ts - b.ts);
          if (anons.length > 0) {
            beepGiris();
            anons.forEach(k => {
              const metin = k.tur === 'personel'
                ? `Sayın ${k.ad}, hoş geldiniz.`
                : `Hoş geldiniz, ${k.ad}.`;
              queueSpeech(metin);
            });
          }
        }
      }
      if (newCikislar.length > 0) {
        setCikislar(sortedC);
        if (sesAcikRef.current) {
          const anons = newCikislar.filter(k => k.ts >= anonsKesim).sort((a, b) => a.ts - b.ts);
          if (anons.length > 0) {
            beepCikis();
            anons.forEach(k => {
              const metin = k.tur === 'personel'
                ? `Sayın ${k.ad}, güle güle.`
                : `Güle güle, ${k.ad}.`;
              queueSpeech(metin);
            });
          }
        }
      }
    }

    const now = Date.now();
    sonBasariRef.current = now;
    setHata(false);
    setSonGuncelleme(new Date(now).toLocaleTimeString('tr-TR',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, []);

  useEffect(() => {
    // Ses sentezi için sesleri yükle
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    // ── SSE bağlantısı: ana veri kanalı ─────────────────────────────────
    // Sunucu bağlantıda anında mevcut veriyi gönderir,
    // ardından her BKDS güncellemesinde veriyi doğrudan push eder.
    // Client'ın ayrıca fetch yapmasına gerek kalmaz.
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const connectSSE = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      es = new EventSource('/api/attendance/stream');

      es.onopen = () => {
        reconnectDelay = 1000; // Başarılı bağlantı — delay sıfırla
        setSseAktif(true);
      };

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'ping') {
            // Bağlantı sağlıklı — hata göstergesini sıfırla ve son kontrol saatini güncelle
            const now = Date.now();
            sonBasariRef.current = now;
            setHata(false);
            setSonGuncelleme(new Date(now).toLocaleTimeString('tr-TR',
              { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            return;
          }
          if (data.type === 'ekranData') {
            processData(data);
          }
        } catch {
          // parse edilemeyen mesajlar — yoksay
        }
      };

      es.onerror = () => {
        setSseAktif(false);
        es?.close();
        // Üstel geri çekilme ile yeniden bağlan (max 10s)
        reconnectTimer = setTimeout(connectSSE, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      };
    };

    connectSSE();

    // ── Yedek fetch: SSE kesilirse veri kaybını önle ─────────────────────
    const fallbackPoll = setInterval(async () => {
      // Son 20s içinde SSE'den veri geldiyse fetch atla
      if (sonBasariRef.current > 0 && Date.now() - sonBasariRef.current < 20000) return;
      try {
        const res = await fetch('/api/attendance');
        if (res.ok) processData(await res.json());
      } catch {}
    }, 20000);

    // ── Hata kontrol: 35s boyunca hiç mesaj gelmemişse uyar ─────────────
    // (heartbeat 10s'de bir gelir, 3 heartbeat kaçırırsa gerçek bağlantı kopması)
    const hataKontrol = setInterval(() => {
      if (sonBasariRef.current > 0 && Date.now() - sonBasariRef.current > 35000) {
        setHata(true);
      }
    }, 5000);

    // Sekme görünür olduğunda kuyruğu temizle
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (speechQueue.length > 2) speechQueue.splice(0, speechQueue.length - 2);
        if (!speechBusy) pumpSpeech();
        // SSE kopmuşsa yeniden bağlan
        if (es?.readyState === EventSource.CLOSED) connectSSE();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(fallbackPoll);
      clearInterval(hataKontrol);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [processData]);

  return { girisler, cikislar, sonGuncelleme, hata, sseAktif };
}

export default function EkranPage() {
  const [sesAcik, setSesAcik] = useState(true);
  const [menuGizli, setMenuGizli] = useState(false);

  const { girisler, cikislar, sonGuncelleme, hata, sseAktif } = useBildirimEkrani(sesAcik);
  const girisListRef = useRef<HTMLDivElement>(null);
  const cikisListRef = useRef<HTMLDivElement>(null);
  const [saat, setSaat] = useState('');
  const [tarih, setTarih] = useState('');

  // Yeni kayıt geldiğinde listeyi en üste kaydır
  useEffect(() => { girisListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [girisler]);
  useEffect(() => { cikisListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [cikislar]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSaat(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTarih(now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none overflow-hidden">

      {/* Üst bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMenuGizli(v => !v)}
            className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title={menuGizli ? 'Menüyü Göster' : 'Menüyü Gizle'}
          >
            {menuGizli ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          <div>
            <p className="text-4xl font-bold tabular-nums tracking-tight leading-none">{saat}</p>
            <p className="text-gray-500 text-xs mt-0.5 capitalize">{tarih}</p>
            {sonGuncelleme && (
              <p className="text-gray-600 text-xs mt-0.5">Son veri: {sonGuncelleme}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Öğrenci / Personel legend */}
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Öğrenci
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Personel
          </span>
          <div className="h-4 w-px bg-gray-700" />
          {/* SSE durumu */}
          <span className={`flex items-center gap-1 text-xs ${sseAktif ? 'text-cyan-600' : 'text-gray-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sseAktif ? 'bg-cyan-500' : 'bg-gray-700'}`} />
            {sseAktif ? 'Canlı' : 'Bağlanıyor'}
          </span>
          <div className="h-4 w-px bg-gray-700" />
          {/* Ses toggle */}
          <button
            onClick={() => setSesAcik(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              sesAcik ? 'bg-green-900/60 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
          >
            {sesAcik ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {sesAcik ? 'Ses Açık' : 'Ses Kapalı'}
          </button>
          {/* Bağlantı durumu */}
          <span className={`w-2 h-2 rounded-full animate-pulse ${hata ? 'bg-red-500' : 'bg-green-500'}`} />
          <div className="h-4 w-px bg-gray-700" />
          {/* Tam ekran */}
          <button
            onClick={() => !document.fullscreenElement
              ? document.documentElement.requestFullscreen()
              : document.exitFullscreen()}
            className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Tam Ekran"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Ana içerik */}
      <div className="flex-1 grid grid-cols-2 min-h-0">

        {/* SOL — GİRİŞLER */}
        <div className="border-r border-gray-800 flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-green-950/60 border-b border-green-900/40 shrink-0">
            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-black text-green-400 uppercase tracking-widest">Giriş</p>
              <p className="text-xs text-green-700">Hoş Geldiniz</p>
            </div>
            <span className="ml-auto text-xs text-green-800 tabular-nums">{girisler.length}</span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div ref={girisListRef} className="flex-1 flex flex-col gap-1.5 px-3 py-2 overflow-y-auto">
            {girisler.length === 0
              ? <div className="flex items-center justify-center py-12"><p className="text-gray-700 text-3xl">—</p></div>
              : girisler.map((k, i) => <BildirimsalKart key={k.id} kayit={k} index={i} />)
            }
          </div>
        </div>

        {/* SAĞ — ÇIKIŞLAR */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-orange-950/60 border-b border-orange-900/40 shrink-0">
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-black text-orange-400 uppercase tracking-widest">Çıkış</p>
              <p className="text-xs text-orange-700">Güle Güle</p>
            </div>
            <span className="ml-auto text-xs text-orange-800 tabular-nums">{cikislar.length}</span>
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          </div>
          <div ref={cikisListRef} className="flex-1 flex flex-col gap-1.5 px-3 py-2 overflow-y-auto">
            {cikislar.length === 0
              ? <div className="flex items-center justify-center py-12"><p className="text-gray-700 text-3xl">—</p></div>
              : cikislar.map((k, i) => <BildirimsalKart key={k.id} kayit={k} index={i} />)
            }
          </div>
        </div>
      </div>

      {menuGizli && (
        <style>{`
          nav, aside, [data-sidebar] { display: none !important; }
          main { margin-left: 0 !important; }
        `}</style>
      )}
    </div>
  );
}

const SEVIYE = [
  { girisKart: 'bg-green-700 border-2 border-green-400 shadow-lg shadow-green-900/40',
    cikisKart: 'bg-orange-700 border-2 border-orange-400 shadow-lg shadow-orange-900/40',
    ogrenciIkon: 'bg-blue-500', personelIkon: 'bg-purple-500',
    metin: 'text-white', saat: 'text-white/80', ad: 'text-3xl', saatSize: 'text-2xl', ikon: 'w-14 h-14' },
  { girisKart: 'bg-green-900/80 border border-green-600',
    cikisKart: 'bg-orange-900/80 border border-orange-600',
    ogrenciIkon: 'bg-blue-600', personelIkon: 'bg-purple-600',
    metin: 'text-green-100', saat: 'text-green-300', ad: 'text-2xl', saatSize: 'text-xl', ikon: 'w-12 h-12' },
  { girisKart: 'bg-green-950/50 border border-green-800/40',
    cikisKart: 'bg-orange-950/50 border border-orange-800/40',
    ogrenciIkon: 'bg-blue-700', personelIkon: 'bg-purple-700',
    metin: 'text-green-300', saat: 'text-green-500', ad: 'text-xl', saatSize: 'text-lg', ikon: 'w-11 h-11' },
  { girisKart: 'bg-gray-900/50 border border-gray-700',
    cikisKart: 'bg-gray-900/50 border border-gray-700',
    ogrenciIkon: 'bg-gray-600', personelIkon: 'bg-gray-600',
    metin: 'text-gray-400', saat: 'text-gray-500', ad: 'text-lg', saatSize: 'text-base', ikon: 'w-10 h-10' },
  { girisKart: 'bg-gray-900/20 border border-gray-800',
    cikisKart: 'bg-gray-900/20 border border-gray-800',
    ogrenciIkon: 'bg-gray-800', personelIkon: 'bg-gray-800',
    metin: 'text-gray-500', saat: 'text-gray-600', ad: 'text-base', saatSize: 'text-sm', ikon: 'w-9 h-9' },
];

function BildirimsalKart({ kayit, index }: { kayit: Kayit; index: number }) {
  const isGiris = kayit.tip === 'giris';
  const s = SEVIYE[Math.min(index, SEVIYE.length - 1)];
  const kart = isGiris ? s.girisKart : s.cikisKart;
  const ikonBg = kayit.tur === 'ogrenci' ? s.ogrenciIkon : s.personelIkon;

  return (
    <div className={`h-16 shrink-0 flex items-center gap-4 rounded-xl px-5 transition-all duration-500 ${kart}`}>
      <div className={`rounded-full flex items-center justify-center shrink-0 ${ikonBg} ${s.ikon}`}>
        {isGiris
          ? <UserCheck className="w-5 h-5 text-white" />
          : <LogOut className="w-5 h-5 text-white" />
        }
      </div>
      <p className={`font-black flex-1 min-w-0 truncate ${s.ad} ${s.metin}`} title={kayit.ad}>
        {kayit.ad}
      </p>
      <p className={`font-bold tabular-nums shrink-0 ${s.saatSize} ${s.saat}`}>{kayit.saat}</p>
    </div>
  );
}
