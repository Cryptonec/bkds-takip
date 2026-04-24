import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Türkçe TTS endpoint — Google Translate TTS'i sunucu tarafından proxy eder.
 * - Client basitçe `<audio src="/api/tts?text=...">` kullanır
 * - CORS sorunu yok (kendi domain'imiz)
 * - Tarayıcı ses ayarına / Windows konuşma paketine bağımlı değil
 * - Tek gereken: sunucunun internet erişimi
 */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text')?.trim();
  if (!text) {
    return NextResponse.json({ error: 'text parametresi gerekli' }, { status: 400 });
  }
  if (text.includes('*')) {
    return NextResponse.json({ error: 'maskeli isim seslendirilmez' }, { status: 400 });
  }

  // Google Translate TTS char limit ~200; uzun metni kısalt
  const cropped = text.slice(0, 200);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cropped)}&tl=tr&client=tw-ob`;

  try {
    const res = await fetch(url, {
      headers: {
        // Bazı User-Agent'ler bloklanabiliyor; tarayıcı taklidi
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!res.ok) {
      return NextResponse.json({
        error: `Google TTS hatası: ${res.status} ${res.statusText}`,
      }, { status: 502 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[TTS] hata:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
