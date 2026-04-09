'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { UserCheck, LogOut, Volume2, VolumeX, GraduationCap, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface Kayit {
  id: string;
  tip: 'giris' | 'cikis';
  tur: 'ogrenci' | 'personel';
  ad: string;
  saat: string;
  ts: number;
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
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
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
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
  } catch {}
}

function cozIsim(k: string, ad: string): string {
  if (!ad.includes('*')) return ad;
  if (typeof window === 'undefined') return ad;
  return localStorage.getItem(`pname_${k}_${ad.substring(0,4)}`) ?? ad;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
}

function useBildirimEkrani(sesAcik: boolean) {
  // Tek kaynak: tüm giriş ve çıkışları ad→Kayit Map olarak tut
  const girisMapRef = useRef<Map<string,Kayit>>(new Map());
  const cikisMapRef = useRef<Map<string,Kayit>>(new Map());
  const [girisler, setGirisler] = useState<Kayit[]>([]);
  const [cikislar, setCikislar] = useState<Kayit[]>([]);
  const [sonGuncelleme, setSonGuncelleme] = useState('');
  const sesAcikRef = useRef(sesAcik);
  const isFirst = useRef(true);
  const prevGirisHash = useRef('');
  const prevCikisHash = useRef('');

  useEffect(() => { sesAcikRef.current = sesAcik; }, [sesAcik]);

  function commitGiris(ses: boolean) {
    const sorted = [...girisMapRef.current.values()].sort((a,b) => b.ts - a.ts);
    setGirisler(sorted);
    if (ses && sesAcikRef.current) calarGiris();
  }

  function commitCikis(ses: boolean) {
    const sorted = [...cikisMapRef.current.values()].sort((a,b) => b.ts - a.ts);
    setCikislar(sorted);
    if (ses && sesAcikRef.current) calarCikis();
  }

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance');
      if (!res.ok) return;
      const json = await res.json();
      const bkdsKayitlar = json.bkdsOgrenciKayitlari ?? [];
      const personelRows = json.personelRows ?? [];
      const tumPersonel = json.tumPersonelGirisler ?? [];

      // Tüm girişleri topla
      const yeniGirisler: Kayit[] = [];
      const yeniCikislar: Kayit[] = [];

      // BKDS kayıtlarından öğrenci girişleri (dersi olsa da olmasa da)
      bkdsKayitlar.filter((b:any) => b.ilkGiris).forEach((b:any) => {
        yeniGirisler.push({ id:`bg-${b.id}`, tip:'giris', tur:'ogrenci',
          ad: b.adSoyad, saat: fmt(b.ilkGiris), ts: new Date(b.ilkGiris).getTime() });
      });
      bkdsKayitlar.filter((b:any) => b.sonCikis).forEach((b:any) => {
        yeniCikislar.push({ id:`bc-${b.id}`, tip:'cikis', tur:'ogrenci',
          ad: b.adSoyad, saat: fmt(b.sonCikis), ts: new Date(b.sonCikis).getTime() });
      });

      // Personel girişleri
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

      // Personel çıkışları
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

      // Hash: mevcut ID listesi
      const girisHash = yeniGirisler.map(x=>x.id).sort().join(',');
      const cikisHash = yeniCikislar.map(x=>x.id).sort().join(',');

      // Giriş map güncelle
      let girisChanged = false;
      yeniGirisler.forEach(k => {
        if (!girisMapRef.current.has(k.ad)) {
          girisMapRef.current.set(k.ad, k);
          girisChanged = true;
        }
      });

      // Çıkış map güncelle
      let cikisChanged = false;
      yeniCikislar.forEach(k => {
        if (!cikisMapRef.current.has(k.ad)) {
          cikisMapRef.current.set(k.ad, k);
          cikisChanged = true;
        }
      });

      // İlk yüklemede sessiz güncelle
      if (isFirst.current) {
        yeniGirisler.forEach(k => girisMapRef.current.set(k.ad, k));
        yeniCikislar.forEach(k => cikisMapRef.current.set(k.ad, k));
        commitGiris(false);
        commitCikis(false);
        isFirst.current = false;
      } else {
        // Sadece yeni kayıt varsa güncelle ve ses çal
        if (girisChanged) commitGiris(true);
        if (cikisChanged) commitCikis(true);
      }

      prevGirisHash.current = girisHash;
      prevCikisHash.current = cikisHash;
      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}));
    } catch(e) { console.error('[Ekran]', e); }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
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

  const { girisler, cikislar, sonGuncelleme } = useBildirimEkrani(sesAcik);
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

      {/* Üst bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          {/* Menü gizle/göster */}
          <button
            onClick={() => setMenuGizli(v => !v)}
            className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title={menuGizli ? 'Menüyü Göster' : 'Menüyü Gizle'}
          >
            {menuGizli
              ? <PanelLeftOpen className="w-4 h-4" />
              : <PanelLeftClose className="w-4 h-4" />
            }
          </button>
          <div>
            <p className="text-4xl font-bold tabular-nums tracking-tight leading-none">{saat}</p>
            <p className="text-gray-500 text-xs mt-0.5 capitalize">{tarih}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-gray-300 font-semibold">Özel Kütahya Umut</p>
            <p className="text-gray-600 text-xs">Özel Eğitim ve Rehabilitasyon Merkezi</p>
          </div>
          {/* Tam ekran */}
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
            <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div className="flex-1 flex flex-col gap-1.5 px-3 py-2 overflow-y-auto">
            {girisler.length === 0
              ? <div className="flex items-center justify-center py-12"><p className="text-gray-700 text-3xl">—</p></div>
              : girisler.map((k,i) => <BildirimsalKart key={k.id} kayit={k} index={i} total={girisler.length} />)
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
            <span className="ml-auto w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          </div>
          <div className="flex-1 flex flex-col gap-1.5 px-3 py-2 overflow-y-auto">
            {cikislar.length === 0
              ? <div className="flex items-center justify-center py-12"><p className="text-gray-700 text-3xl">—</p></div>
              : cikislar.map((k,i) => <BildirimsalKart key={k.id} kayit={k} index={i} total={cikislar.length} />)
            }
          </div>
        </div>
      </div>

      {/* Alt bar */}
      <div className="px-6 py-2 border-t border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Öğrenci
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Personel
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSesAcik(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              sesAcik ? 'bg-green-900/60 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
          >
            {sesAcik ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {sesAcik ? 'Ses Açık' : 'Ses Kapalı'}
          </button>
          <span className="text-gray-700 text-xs">{sonGuncelleme ? `${sonGuncelleme}` : 'Bağlanıyor...'}</span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>

      {/* Menü gizleme overlay */}
      {menuGizli && (
        <style>{`
          nav, aside, [data-sidebar] { display: none !important; }
          main { margin-left: 0 !important; }
        `}</style>
      )}
    </div>
  );
}

// Seviye stilleri — YENİ badge yok
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

function BildirimsalKart({ kayit, index, total = 5 }: { kayit: Kayit; index: number; total?: number }) {
  const isGiris = kayit.tip === 'giris';
  const s = SEVIYE[Math.min(index, SEVIYE.length-1)];
  const kart = isGiris ? s.girisKart : s.cikisKart;
  const ikonBg = kayit.tur === 'ogrenci' ? s.ogrenciIkon : s.personelIkon;

  return (
    <div className={`h-16 shrink-0 flex items-center gap-4 rounded-xl px-5 transition-all duration-500 ${kart}`}>
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
