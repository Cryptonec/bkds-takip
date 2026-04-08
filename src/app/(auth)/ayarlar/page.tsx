'use client';
import { useState } from 'react';
import { Settings, RefreshCw, Loader2, Info } from 'lucide-react';

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

      {/* Bilgi kartı */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-0.5">Giriş bilgileri rehapp üzerinden alınıyor</p>
          <p className="text-blue-600">bkds.meb.gov.tr kullanıcı adı ve şifrenizi rehapp uygulamasındaki BKDS sekmesinden güncelleyebilirsiniz.</p>
        </div>
      </div>

      {/* BKDS Bağlantı Testi */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">BKDS Bağlantı Testi</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={testBkds}
            disabled={bkdsLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {bkdsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            BKDS&apos;yi Test Et
          </button>
          {bkdsResult && (
            <span className={`text-sm ${bkdsResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {bkdsResult}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
