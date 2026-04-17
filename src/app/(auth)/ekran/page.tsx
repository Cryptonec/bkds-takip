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

const MAX_NORMAL = 5;
const MAX_FULLSCREEN = 15;
const POLL_MS = 1000;

function toTurkishTitle(text: string): string {
  return text
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü')
    .replace(/Ş/g, 'ş').replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç');
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (text.includes('*')) return; // Maskeli isim — söyleme
  try {
    const utt = new SpeechSynthesisUtterance(toTurkishTitle(text));
    utt.lang = 'tr-TR';
    utt.rate = 0.9;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const trVoice = voices.find(v => v.lang.startsWith('tr'));
    if (trVoice) utt.voice = trVoice;
    window.speechSynthesis.speak(utt);
  } catch {}
}

function calarGiris() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.25);
  } catch {}
}

function calarCikis() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 523;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.25);
  } catch {}
}

function cozIsim(k: string, ad: string): string {
  if (!ad.includes('*')) return ad;
  if (typeof window === 'undefined') return ad;
  return localStorage.getItem(`pname_${k}_${ad.substring(0,4)}`) ?? ad;
}

function fmt(iso: string | Date) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
}

function useBildirimEkrani(sesAcik: boolean, max: number) {
  const girisMapRef = useRef<Map<string,Kayit>>(new Map());
  const cikisMapRef = useRef<Map<string,Kayit>>(new Map());
  const [girisler, setGirisler] = useState<Kayit[]>([]);
  const [cikislar, setCikislar] = useState<Kayit[]>([]);
  const [sonGuncelleme, setSonGuncelleme] = useState('');
  const sesAcikRef = useRef(sesAcik);
  const maxRef = useRef(max);
  const isFirst = useRef(true);

  useEffect(() => { sesAcikRef.current = sesAcik; }, [sesAcik]);
  useEffect(() => {
    maxRef.current = max;
    commitGiris(null);
    commitCikis(null);
  }, [max]);

  function commitGiris(yeniKayit: Kayit | null) {
    const sorted = [...girisMapRef.current.values()]
      .sort((a,b) => b.ts - a.ts)
      .slice(0, maxRef.current);
    setGirisler(sorted);
    if (yeniKayit && sesAcikRef.current) {
      calarGiris();
      setTimeout(() => speak(yeniKayit.ad), 250);
    }
  }

  function commitCikis(yeniKayit: Kayit | null) {
    const sorted = [...cikisMapRef.current.values()]
      .sort((a,b) => b.ts - a.ts)
      .slice(0, maxRef.current);
    setCikislar(sorted);
    if (yeniKayit && sesAcikRef.current) {
      calarCikis();
      setTimeout(() => speak(yeniKayit.ad), 250);
    }
  }

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance');
      if (!res.ok) return;
      const json = await res.json();
      const ogrenciRows = json.ogrenciRows ?? [];
      const personelRows = json.personelRows ?? [];
      const tumPersonel = json.tumPersonelGirisler ?? [];
      const tumOgrenci  = json.tumOgrenciGirisler  ?? [];

      const yeniGirisler: Kayit[] = [];
      const yeniCikislar: Kayit[] = [];

      // 1) Öğrenci giriş/çıkışları: önce ders-bazlı kayıtlar, sonra BKDS ham verisi (Lila olmasa bile)
      const ogrenciGirisKeys = new Set<string>();
      const ogrenciCikisKeys = new Set<string>();
      ogrenciRows.filter((r:any) => r.gercekGiris).forEach((r:any) => {
        ogrenciGirisKeys.add(r.ogrenciId);
        yeniGirisler.push({ id:`og-${r.ogrenciId}`, tip:'giris', tur:'ogrenci',
          ad: r.ogrenciAdi, saat: fmt(r.gercekGiris), ts: new Date(r.gercekGiris).getTime() });
      });
      ogrenciRows.filter((r:any) => r.gercekCikis).forEach((r:any) => {
        ogrenciCikisKeys.add(r.ogrenciId);
        yeniCikislar.push({ id:`oc-${r.ogrenciId}`, tip:'cikis', tur:'ogrenci',
          ad: r.ogrenciAdi, saat: fmt(r.gercekCikis), ts: new Date(r.gercekCikis).getTime() });
      });
      // BKDS ham verisinden: dersi olmayan veya ders-bazlı eşleşmeyen öğrenciler
      tumOgrenci.forEach((o:any) => {
        const k = o.studentId ?? o.key;
        if (o.ilkGiris && !ogrenciGirisKeys.has(k)) {
          const ad = cozIsim(k, o.ogrenciAdi);
          yeniGirisler.push({ id:`to-${k}`, tip:'giris', tur:'ogrenci',
            ad, saat: fmt(o.ilkGiris), ts: new Date(o.ilkGiris).getTime() });
        }
        if (o.sonCikis && !ogrenciCikisKeys.has(k)) {
          const ad = cozIsim(k, o.ogrenciAdi);
          yeniCikislar.push({ id:`toc-${k}`, tip:'cikis', tur:'ogrenci',
            ad, saat: fmt(o.sonCikis), ts: new Date(o.sonCikis).getTime() });
        }
      });

      // 2) Personel giriş/çıkışları
      const pgKeys = new Set<string>();
      personelRows.filter((r:any) => r.baslamaZamani).forEach((r:any) => {
        pgKeys.add(r.staffId);
        yeniGirisler.push({ id:`pg-${r.staffId}`, tip:'giris', tur:'personel',
          ad: r.ogretmenAdi, saat: fmt(r.baslamaZamani), ts: new Date(r.baslamaZamani).getTime() });
      });
      tumPersonel.forEach((p:any) => {
        const k = p.staffId ?? p.ogretmenAdi;
        if (!pgKeys.has(k) && p.ilkGiris) {
          const ad = cozIsim(k, p.ogretmenAdi);
          if (!ad.includes('*'))
            yeniGirisler.push({ id:`tp-${k}`, tip:'giris', tur:'personel',
              ad, saat: fmt(p.ilkGiris), ts: new Date(p.ilkGiris).getTime() });
        }
      });

      const pcKeys = new Set<string>();
      personelRows.filter((r:any) => r.sonCikisZamani).forEach((r:any) => {
        pcKeys.add(r.staffId);
        yeniCikislar.push({ id:`pc-${r.staffId}`, tip:'cikis', tur:'personel',
          ad: r.ogretmenAdi, saat: fmt(r.sonCikisZamani), ts: new Date(r.sonCikisZamani).getTime() });
      });
      tumPersonel.filter((p:any) => p.sonCikis).forEach((p:any) => {
        const k = p.staffId ?? p.ogretmenAdi;
        if (!pcKeys.has(k)) {
          const ad = cozIsim(k, p.ogretmenAdi);
          if (!ad.includes('*'))
            yeniCikislar.push({ id:`tpc-${k}`, tip:'cikis', tur:'personel',
              ad, saat: fmt(p.sonCikis), ts: new Date(p.sonCikis).getTime() });
        }
      });

      // Map güncelle
      let yeniGiris: Kayit | null = null;
      let yeniCikis: Kayit | null = null;
      yeniGirisler.forEach(k => {
        const key = `${k.tur}:${k.ad}`;
        if (!girisMapRef.current.has(key)) {
          girisMapRef.current.set(key, k);
          if (!isFirst.current && (!yeniGiris || k.ts > yeniGiris.ts)) yeniGiris = k;
        }
      });
      yeniCikislar.forEach(k => {
        const key = `${k.tur}:${k.ad}`;
        if (!cikisMapRef.current.has(key)) {
          cikisMapRef.current.set(key, k);
          if (!isFirst.current && (!yeniCikis || k.ts > yeniCikis.ts)) yeniCikis = k;
        }
      });

      if (isFirst.current) {
        commitGiris(null);
        commitCikis(null);
        isFirst.current = false;
      } else {
        if (yeniGiris) commitGiris(yeniGiris);
        if (yeniCikis) commitCikis(yeniCikis);
      }

      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}));
    } catch(e) { console.error('[Ekran]', e); }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVis = () => { if (document.visibilityState==='visible') poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [poll]);

  return { girisler, cikislar, sonGuncelleme };
}

export default function EkranPage() {
  const [sesAcik, setSesAcik] = useState(true);
  const [menuGizli, setMenuGizli] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFS);
    return () => document.removeEventListener('fullscreenchange', onFS);
  }, []);

  // TTS seslerini hazırda tutmak için (bazı tarayıcılar ilk kullanımda boş liste dönüyor)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const onVoices = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', onVoices);
      return () => window.speechSynthesis.removeEventListener?.('voiceschanged', onVoices);
    }
  }, []);

  const MAX = isFullscreen ? MAX_FULLSCREEN : MAX_NORMAL;
  const { girisler, cikislar, sonGuncelleme } = useBildirimEkrani(sesAcik, MAX);
  const [saat, setSaat] = useState('');
  const [tarih, setTarih] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSaat(now.toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}));
      setTarih(now.toLocaleDateString('tr-TR', {weekday:'long',day:'numeric',month:'long',year:'numeric'}));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none overflow-hidden">

      {/* Üst bar — saat, kurum, canlı/ses/son-veri, fullscreen */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => setMenuGizli(v => !v)}
            className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors shrink-0"
            title={menuGizli ? 'Menüyü Göster' : 'Menüyü Gizle'}
          >
            {menuGizli ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <p className="text-4xl font-bold tabular-nums tracking-tight leading-none">{saat}</p>
            <p className="text-gray-500 text-xs mt-0.5 capitalize truncate">{tarih}</p>
          </div>
        </div>

        {/* Orta — canlı, ses, son veri */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-900/60 border border-green-700 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Canlı
          </span>
          <button
            onClick={() => setSesAcik(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              sesAcik ? 'bg-green-900/60 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
          >
            {sesAcik ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {sesAcik ? 'Ses Açık' : 'Ses Kapalı'}
          </button>
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 tabular-nums">
            Son veri: {sonGuncelleme || '—'}
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden md:block">
            <p className="text-gray-300 font-semibold">Özel Kütahya Umut</p>
            <p className="text-gray-600 text-xs">Özel Eğitim ve Rehabilitasyon Merkezi</p>
          </div>
          <button
            onClick={() => !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen()}
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
        <div className="border-r border-gray-800 flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-green-950/60 border-b border-green-900/40 shrink-0">
            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-black text-green-400 uppercase tracking-widest">Giriş</p>
              <p className="text-xs text-green-700">Hoş Geldiniz</p>
            </div>
            <span className="ml-auto text-xs text-green-700 tabular-nums">{girisler.length} kayıt</span>
          </div>
          <div className="flex-1 flex flex-col gap-1.5 px-3 py-2 overflow-hidden">
            {girisler.length === 0
              ? <div className="flex-1 flex items-center justify-center"><p className="text-gray-700 text-3xl">—</p></div>
              : girisler.map((k,i) => <BildirimsalKart key={k.id} kayit={k} index={i} total={girisler.length} />)
            }
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-orange-950/60 border-b border-orange-900/40 shrink-0">
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-black text-orange-400 uppercase tracking-widest">Çıkış</p>
              <p className="text-xs text-orange-700">Güle Güle</p>
            </div>
            <span className="ml-auto text-xs text-orange-700 tabular-nums">{cikislar.length} kayıt</span>
          </div>
          <div className="flex-1 flex flex-col gap-1.5 px-3 py-2 overflow-hidden">
            {cikislar.length === 0
              ? <div className="flex-1 flex items-center justify-center"><p className="text-gray-700 text-3xl">—</p></div>
              : cikislar.map((k,i) => <BildirimsalKart key={k.id} kayit={k} index={i} total={cikislar.length} />)
            }
          </div>
        </div>
      </div>

      {/* Alt bar — sadece legend */}
      <div className="px-6 py-2 border-t border-gray-800 flex items-center justify-center gap-6 shrink-0 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Öğrenci
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Personel
        </span>
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
  { girisKart:'bg-green-700 border-2 border-green-400 shadow-lg shadow-green-900/40',
    cikisKart:'bg-orange-700 border-2 border-orange-400 shadow-lg shadow-orange-900/40',
    ogrenciIkon:'bg-blue-500', personelIkon:'bg-purple-500',
    metin:'text-white', saat:'text-white/80', ad:'text-3xl', saatSize:'text-2xl', ikon:'w-14 h-14' },
  { girisKart:'bg-green-900/80 border border-green-600',
    cikisKart:'bg-orange-900/80 border border-orange-600',
    ogrenciIkon:'bg-blue-600', personelIkon:'bg-purple-600',
    metin:'text-green-100', saat:'text-green-300', ad:'text-2xl', saatSize:'text-xl', ikon:'w-12 h-12' },
  { girisKart:'bg-green-950/50 border border-green-800/40',
    cikisKart:'bg-orange-950/50 border border-orange-800/40',
    ogrenciIkon:'bg-blue-700', personelIkon:'bg-purple-700',
    metin:'text-green-300', saat:'text-green-500', ad:'text-xl', saatSize:'text-lg', ikon:'w-11 h-11' },
  { girisKart:'bg-gray-900/50 border border-gray-700',
    cikisKart:'bg-gray-900/50 border border-gray-700',
    ogrenciIkon:'bg-gray-600', personelIkon:'bg-gray-600',
    metin:'text-gray-400', saat:'text-gray-500', ad:'text-lg', saatSize:'text-base', ikon:'w-10 h-10' },
  { girisKart:'bg-gray-900/20 border border-gray-800',
    cikisKart:'bg-gray-900/20 border border-gray-800',
    ogrenciIkon:'bg-gray-800', personelIkon:'bg-gray-800',
    metin:'text-gray-500', saat:'text-gray-600', ad:'text-base', saatSize:'text-sm', ikon:'w-9 h-9' },
];

function BildirimsalKart({ kayit, index }: { kayit: Kayit; index: number; total?: number }) {
  const isGiris = kayit.tip === 'giris';
  const s = SEVIYE[Math.min(index, SEVIYE.length-1)];
  const kart = isGiris ? s.girisKart : s.cikisKart;
  const ikonBg = kayit.tur === 'ogrenci' ? s.ogrenciIkon : s.personelIkon;

  return (
    <div className={`flex-1 flex items-center gap-4 rounded-xl px-5 transition-all duration-500 min-h-0 ${kart}`}>
      <div className={`rounded-full flex items-center justify-center shrink-0 ${ikonBg} ${s.ikon}`}>
        <UserCheck className="w-5 h-5 text-white" />
      </div>
      <p className={`font-black flex-1 min-w-0 truncate ${s.ad} ${s.metin}`} title={kayit.ad}>
        {kayit.ad}
      </p>
      <p className={`font-bold tabular-nums shrink-0 ${s.saatSize} ${s.saat}`}>{kayit.saat}</p>
    </div>
  );
}
