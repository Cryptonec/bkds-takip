'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export interface LiveData {
  tarih: string;
  ogrenciRows: OgrenciRow[];
  personelRows: PersonelRow[];
  statusCounts: Record<string, number>;
  staffStatusCounts: Record<string, number>;
  alerts: number;
  alertList: Alert[];
  bildirimler: Bildirim[];
  tumPersonelGirisler: PersonelGiris[];
  updatedAt: string;
  bkdsError?: string | null;
}

export interface OgrenciRow {
  id: string;
  lessonSessionId: string;
  ogrenciAdi: string;
  ogrenciId: string;
  ogretmenAdi: string;
  derslik: string;
  baslangic: string;
  bitis: string;
  bkdsRequired: boolean;
  gercekGiris?: string | null;
  gercekCikis?: string | null;
  status: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  yaklasanUyari: boolean;
  gelmediUyari: boolean;
  erkenCikisUyari: boolean;
  dakikaKaldi: number;
  minKalmaSuresi: number;
}

export interface PersonelRow {
  id: string;
  staffSessionId: string;
  ogretmenAdi: string;
  staffId: string;
  derslik: string;
  baslangic: string;
  bitis: string;
  basladiMi: boolean;
  baslamaZamani?: string | null;
  sonCikisZamani?: string | null;
  status: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
}

export interface PersonelGiris {
  staffId: string;
  ogretmenAdi: string;
  ilkGiris: string;
  sonCikis: string | null;
  eslesmeDurumu: string;
  tahmin: string | null;
  dersVar: boolean;
}

export interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  entityType: string;
  entityId: string;
}

export interface Bildirim {
  id: string;
  tip: 'gelmedi' | 'erken_cikis';
  mesaj: string;
  severity: 'uyari' | 'kritik';
  ogrenciAdi: string;
  derslik: string;
  baslangic: string;
}

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
  const normalized = toTurkishTitle(text);
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(normalized);
  utt.lang = 'tr-TR';
  utt.rate = 0.9;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const trVoice = voices.find(v => v.lang.startsWith('tr'));
  if (trVoice) utt.voice = trVoice;
  window.speechSynthesis.speak(utt);
}

function playBeep(tip: 'giris' | 'cikis' | 'uyari' | 'kritik' | 'personel_giris' | 'personel_cikis') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const freqMap: Record<string, number[]> = {
      giris: [880], cikis: [440], uyari: [660], kritik: [900, 700],
      personel_giris: [660, 880], personel_cikis: [550, 440],
    };
    (freqMap[tip] ?? [660]).forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      const t = ctx.currentTime + i * 0.28;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {}
}

export function useLiveAttendance(tarih?: string, intervalMs = 5000) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Öğrenci
  const prevGirisIds  = useRef<Set<string>>(new Set());
  const prevCikisIds  = useRef<Set<string>>(new Set());
  // Personel — TÜM kaynaklar (personelRows + tumPersonelGirisler) birleşik key ile
  const prevTumGirisKeys = useRef<Set<string>>(new Set());
  const prevTumCikisKeys = useRef<Set<string>>(new Set());
  // Bildirim
  const prevBildirimIds = useRef<Set<string>>(new Set());

  const [yeniBildirimler, setYeniBildirimler] = useState<Bildirim[]>([]);
  const [yeniGirisler,    setYeniGirisler]    = useState<OgrenciRow[]>([]);
  const [yeniCikislar,    setYeniCikislar]    = useState<OgrenciRow[]>([]);
  const [yeniPersonelGiris, setYeniPersonelGiris] = useState<Array<{id:string;ad:string;derslik?:string}>>([]);
  const [yeniPersonelCikis, setYeniPersonelCikis] = useState<Array<{id:string;ad:string;derslik?:string}>>([]);

  const isFirstFetch = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const params = tarih ? `?tarih=${tarih}` : '';
      const sep = params ? '&' : '?';
      const startedAt = Date.now();
      const res = await window.fetch(`/api/attendance${params}${sep}_t=${startedAt}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Veri alınamadı');
      const json: LiveData = await res.json();
      const now = new Date();
      if (typeof window !== 'undefined') {
        (window as any).__lastPoll = startedAt;
        console.debug('[poll]', new Date(startedAt).toLocaleTimeString(), 'ogr:', json.ogrenciRows?.length, 'per:', json.personelRows?.length);
      }

      // Tüm personel girişlerini tek bir haritada topla
      // key = staffId (varsa) veya ogretmenAdi
      // Sadece bildirime değer olanlar: dersi olan VE/VEYA maskesiz (yani
      // tanımlı) personel. Maskeli + derssiz kişiler BKDS'de biyometrik
      // eşleşmesi olmayan diğer kurum çalışanları veya tanıdık değişen kişiler;
      // onlar için 'ders başladı' bildirimi yanlış olur.
      const tumGirisMap = new Map<string, { ad: string; derslik?: string; cikisVar: boolean; girisTs: number; cikisTs: number }>();

      // personelRows'tan — dersi olan personel (her zaman dahil)
      for (const r of json.personelRows) {
        if (r.baslamaZamani) {
          tumGirisMap.set(r.staffId, {
            ad: r.ogretmenAdi,
            derslik: r.derslik,
            cikisVar: !!(r.sonCikisZamani || now > new Date(r.bitis)),
            girisTs: new Date(r.baslamaZamani).getTime(),
            cikisTs: r.sonCikisZamani ? new Date(r.sonCikisZamani).getTime() : 0,
          });
        }
      }
      // tumPersonelGirisler'den — sadece MASKELENMEMİŞ (Lila ile eşleşen)
      // personel dahil edilir. Maskeli isimler için bildirim tetiklenmez.
      for (const p of (json.tumPersonelGirisler ?? [])) {
        const key = p.staffId ?? p.ogretmenAdi;
        if (tumGirisMap.has(key)) continue;
        if (!p.ogretmenAdi || p.ogretmenAdi.includes('*')) continue; // maskeli — atla
        tumGirisMap.set(key, {
          ad: p.ogretmenAdi,
          cikisVar: !!p.sonCikis,
          girisTs: p.ilkGiris ? new Date(p.ilkGiris).getTime() : 0,
          cikisTs: p.sonCikis ? new Date(p.sonCikis).getTime() : 0,
        });
      }

      // Ses sadece SON 2 DK içinde gerçekleşen kayıtlar için — stale veriye
      // "güle güle" demeyi önler (server restart / ilk açılış / HMR vs.)
      const SES_ESIK_MS = 2 * 60 * 1000;
      const simdi = Date.now();
      const yakinZaman = (ts: number) => ts > 0 && simdi - ts < SES_ESIK_MS;

      if (!isFirstFetch.current) {
        // --- Yeni personel girişleri ---
        const yeniPG: Array<{id:string;ad:string;derslik?:string;ts:number}> = [];
        for (const [key, val] of tumGirisMap.entries()) {
          if (!prevTumGirisKeys.current.has(key)) {
            yeniPG.push({ id: key, ad: val.ad, derslik: val.derslik, ts: val.girisTs });
          }
        }
        if (yeniPG.length > 0) {
          setYeniPersonelGiris(yeniPG);
          yeniPG.forEach(p => {
            if (!yakinZaman(p.ts)) return;
            playBeep('personel_giris');
            setTimeout(() => speak(`Sayın ${p.ad}, hoş geldiniz`), 400);
          });
          setTimeout(() => setYeniPersonelGiris([]), 5000);
        }

        // --- Yeni personel çıkışları ---
        const yeniPC: Array<{id:string;ad:string;derslik?:string;ts:number}> = [];
        for (const [key, val] of tumGirisMap.entries()) {
          if (val.cikisVar && prevTumGirisKeys.current.has(key) && !prevTumCikisKeys.current.has(key)) {
            yeniPC.push({ id: key, ad: val.ad, derslik: val.derslik, ts: val.cikisTs });
          }
        }
        if (yeniPC.length > 0) {
          setYeniPersonelCikis(yeniPC);
          yeniPC.forEach(p => {
            if (!yakinZaman(p.ts)) return;
            playBeep('personel_cikis');
            setTimeout(() => speak(`Sayın ${p.ad}, güle güle`), 400);
          });
          setTimeout(() => setYeniPersonelCikis([]), 5000);
        }

        // --- Öğrenci girişleri ---
        const yeniG = json.ogrenciRows.filter(
          r => r.gercekGiris && !prevGirisIds.current.has(r.ogrenciId)
        );
        if (yeniG.length > 0) {
          setYeniGirisler(yeniG);
          yeniG.forEach(r => {
            if (!yakinZaman(new Date(r.gercekGiris!).getTime())) return;
            playBeep('giris');
            setTimeout(() => speak(`${r.ogrenciAdi}, hoş geldiniz`), 400);
          });
          setTimeout(() => setYeniGirisler([]), 5000);
        }

        // --- Öğrenci çıkışları ---
        const yeniC = json.ogrenciRows.filter(
          r => r.gercekCikis && !prevCikisIds.current.has(r.ogrenciId)
        );
        if (yeniC.length > 0) {
          setYeniCikislar(yeniC);
          yeniC.forEach(r => {
            if (!yakinZaman(new Date(r.gercekCikis!).getTime())) return;
            playBeep('cikis');
            setTimeout(() => speak(`${r.ogrenciAdi}, güle güle`), 400);
          });
          setTimeout(() => setYeniCikislar([]), 5000);
        }

        // --- Uyarı bildirimleri ---
        const yeniB = json.bildirimler.filter(b => !prevBildirimIds.current.has(b.id));
        if (yeniB.length > 0) {
          setYeniBildirimler(prev => [...prev, ...yeniB]);
          playBeep(yeniB.some(b => b.severity === 'kritik') ? 'kritik' : 'uyari');
          if (Notification.permission === 'granted') {
            yeniB.forEach(b => new Notification(
              b.tip === 'erken_cikis' ? '⚡ Erken Çıkış' : '🚨 Öğrenci Gelmedi',
              { body: b.mesaj, tag: b.id }
            ));
          }
        }
      }

      // Ref'leri güncelle — her fetch'te
      prevGirisIds.current  = new Set(json.ogrenciRows.filter(r => r.gercekGiris).map(r => r.ogrenciId));
      prevCikisIds.current  = new Set(json.ogrenciRows.filter(r => r.gercekCikis).map(r => r.ogrenciId));
      prevTumGirisKeys.current = new Set(tumGirisMap.keys());
      prevTumCikisKeys.current = new Set(
        [...tumGirisMap.entries()].filter(([, v]) => v.cikisVar).map(([k]) => k)
      );
      prevBildirimIds.current = new Set(json.bildirimler.map(b => b.id));
      isFirstFetch.current = false;

      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tarih]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    }
    fetchData();
    // intervalMs <= 0 ise otomatik yenileme kapalı, sadece ilk fetch + event'ler
    const interval = intervalMs > 0 ? setInterval(fetchData, intervalMs) : null;
    const onVis = () => { if (document.visibilityState === 'visible') fetchData(); };
    const onFocus = () => fetchData();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchData, intervalMs]);

  const dismissBildirim = useCallback((id: string) => {
    setYeniBildirimler(prev => prev.filter(b => b.id !== id));
  }, []);

  return {
    data, loading, error, lastUpdated, refresh: fetchData,
    yeniBildirimler, dismissBildirim,
    yeniGirisler, yeniCikislar,
    yeniPersonelGiris, yeniPersonelCikis,
  };
}
