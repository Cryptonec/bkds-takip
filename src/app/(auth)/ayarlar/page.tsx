'use client';
import { useState } from 'react';
import { Settings, RefreshCw, Loader2 } from 'lucide-react';

export default function AyarlarPage() {
  const [bkdsLoading, setBkdsLoading] = useState(false);
  const [bkdsResult, setBkdsResult] = useState('');

  async function testBkds() {
    setBkdsLoading(true);
    setBkdsResult('');
    try {
      const res = await fetch('/api/bkds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (data.success) {
        setBkdsResult(`✓ Bağlantı başarılı. ${data.recordCount} kayıt çekildi.`);
      } else {
        setBkdsResult(`✗ Hata: ${data.error}`);
      }
    } catch (err: any) {
      setBkdsResult(`✗ Bağlantı hatası: ${err.message}`);
    } finally {
      setBkdsLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
        <p className="text-gray-500 text-sm mt-1">Sistem yapılandırması</p>
      </div>

      {/* BKDS connection */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">BKDS Bağlantısı</h2>
        </div>
        <div className="space-y-3 text-sm text-gray-600 mb-4">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span>URL</span>
            <span className="font-mono text-gray-500">{process.env.NEXT_PUBLIC_BKDS_URL ?? 'bkds.meb.gov.tr'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span>Polling Aralığı</span>
            <span className="font-mono text-gray-500">60 saniye</span>
          </div>
          <div className="flex justify-between py-2">
            <span>Playwright Modu</span>
            <span className="font-mono text-gray-500">Headless</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={testBkds}
            disabled={bkdsLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {bkdsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            BKDS'yi Test Et
          </button>
          {bkdsResult && (
            <span className={`text-sm ${bkdsResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {bkdsResult}
            </span>
          )}
        </div>
      </div>

      {/* Env info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-700 mb-3 text-sm">Ortam Değişkenleri (.env)</h2>
        <div className="space-y-2 text-xs font-mono">
          {[
            'DATABASE_URL',
            'NEXTAUTH_SECRET',
            'BKDS_URL',
            'BKDS_USERNAME',
            'BKDS_PASSWORD',
            'BKDS_KURUM_KODU',
            'BKDS_POLL_INTERVAL',
          ].map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-blue-600">{key}</span>
              <span className="text-gray-400">=</span>
              <span className="text-gray-500">{'*'.repeat(12)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Değerleri değiştirmek için <code className="bg-gray-200 px-1 rounded">.env</code> dosyasını düzenleyin ve sunucuyu yeniden başlatın.
        </p>
      </div>
    </div>
  );
}
