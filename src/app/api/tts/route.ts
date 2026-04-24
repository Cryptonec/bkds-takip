import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const dynamic = 'force-dynamic';

/**
 * Türkçe TTS endpoint — Microsoft Edge'in Azure Neural TTS servisini kullanır.
 * Windows TTS ayarlarından bağımsız; sistemde Türkçe konuşma paketi olmasa
 * bile çalışır. Limit pratik olarak yok (Azure free tier çok geniş).
 *
 * GET /api/tts?text=Merhaba → MP3 audio stream döner
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
    // tr-TR-AhmetNeural: erkek, sıcak ton
    // tr-TR-EmelNeural: kadın, profesyonel
    await tts.setMetadata('tr-TR-EmelNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);

    // Node Readable → Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        audioStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        audioStream.on('end', () => controller.close());
        audioStream.on('error', (err: Error) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600', // kısa süreli client cache
      },
    });
  } catch (err: any) {
    console.error('[TTS] hata:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'TTS hatası' }, { status: 500 });
  }
}
