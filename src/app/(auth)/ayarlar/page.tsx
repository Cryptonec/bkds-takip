'use client';
import { useState, useEffect } from 'react';
import { Settings, RefreshCw, Loader2, Save, KeyRound } from 'lucide-react';

export default function AyarlarPage() {
  const [bkdsLoading, setBkdsLoading] = useState(false);
  const [bkdsResult, setBkdsResult] = useState('');

  // MEB kimlik bilgileri
  const [credLoading, setCredLoading] = useState(true);
  const [credSaving, setCredSaving] = useState(false);
  const [credMsg, setCredMsg] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cityId, setCityId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [remId, setRemId] = useState('');

  useEffect(() => {
    fetch('/api/credentials')
      .then(r => r.json())
      .then(d => {
        setUsername(d.username ?? '');
        setCityId(d.cityId ?? '');
        setDistrictId(d.districtId ?? '');
        setRemId(d.remId ?? '');
      })
      .catch(() => {})
      .finally(() => setCredLoading(false));
  }, []);

  async function saveCreds(e: React.FormEvent) {
    e.preventDefault();
    setCredSaving(true);
    setCredMsg('');
    try {
      const body: any = { username, cityId, districtId, remId };
      if (password) body.password = password;
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setCredMsg('✓ Kaydedildi.');
        setPassword('');
      } else {
        setCredMsg(`✗ ${data.error}`);
      }
    } catch (err: any) {
      setCredMsg(`✗ ${err.message}`);
    } finally {
      setCredSaving(false);
    }
  }

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

      {/* MEB BKDS Kimlik Bilgileri */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">bkds.meb.gov.tr Giriş Bilgileri</h2>
        </div>
        {credLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor...
          </div>
        ) : (
          <form onSubmit={saveCreds} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kullanıcı Adı</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="MEB kullanıcı adı"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Değiştirmek için girin"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">İl Kodu <span className="text-gray-400">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={cityId}
                  onChange={e => setCityId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="örn. 06"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">İlçe Kodu <span className="text-gray-400">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={districtId}
                  onChange={e => setDistrictId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="örn. 001"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">RAM Kodu <span className="text-gray-400">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={remId}
                  onChange={e => setRemId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="RAM kodu"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={credSaving || !username}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {credSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Kaydet
              </button>
              {credMsg && (
                <span className={`text-sm ${credMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                  {credMsg}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* BKDS Bağlantı Testi */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
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
