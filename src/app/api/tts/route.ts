import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Türkçe TTS endpoint — Microsoft Edge Neural TTS (Azure) kullanır.
 * Windows konuşma paketine bağımlı değildir; sistemde ses yüklü olmasa bile
 * çalışır. Gerektirdiği: internet.
 */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text')?.trim();
  if (!text || text.length === 0) {
    return NextResponse.json({ error: 'text parametresi gerekli' }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: 'text çok uzun (max 500 karakter)' }, { status: 400 });
  }
  if (text.includes('*')) {
    return NextResponse.json({ error: 'maskeli isim seslendirilmez' }, { status: 400 });
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('tr-TR-EmelNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);

    // Tüm stream'i buffer'a topla — sonra tek response olarak gönder.
    // Stream chunked response'a göre tarayıcılar çok daha güvenilir oynatır.
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('close', () => resolve());
      audioStream.on('error', (err: Error) => reject(err));
      // Güvenlik: 15sn timeout
      setTimeout(() => reject(new Error('TTS timeout (15sn)')), 15_000);
    });

    const audio = Buffer.concat(chunks);
    if (audio.length === 0) {
      return NextResponse.json({ error: 'TTS boş ses döndü' }, { status: 500 });
    }

    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[TTS] hata:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

