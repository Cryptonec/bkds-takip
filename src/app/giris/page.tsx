'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Loader2 } from 'lucide-react';

function GirisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const attempted = useRef(false);

  // SSO token akışı (Rehapp'tan gelen token)
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoFailed, setSsoFailed] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || attempted.current) return;
    attempted.current = true;
    setSsoLoading(true);

    signIn('credentials', { ssoToken: token, redirect: false }).then((result) => {
      if (result?.error) {
        setSsoLoading(false);
        setSsoFailed(true);
      } else {
        router.push('/dashboard');
      }
    });
  }, [searchParams, router]);

  // Direkt email/şifre girişi
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setFormError('E-posta veya şifre hatalı');
      setFormLoading(false);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center mb-3">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BKDS Takip</h1>
          <p className="text-sm text-gray-500 mt-1">Özel Eğitim Rehabilitasyon Merkezi</p>
        </div>

        {/* SSO yükleniyor */}
        {ssoLoading && (
          <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm">Giriş yapılıyor...</p>
          </div>
        )}

        {/* SSO başarısız veya token yok → email/şifre formu */}
        {!ssoLoading && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SSO hata bildirimi */}
            {(ssoFailed || urlError === 'SSOFailed') && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-3 py-2 rounded-lg">
                Otomatik giriş başarısız. Lütfen e-posta ve şifrenizle giriş yapın.
              </div>
            )}
            {urlError && urlError !== 'SSOFailed' && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                Giriş başarısız. Lütfen tekrar deneyin.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="kullanici@kurum.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={formLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {formLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Giriş yapılıyor...
                </>
              ) : (
                'Giriş Yap'
              )}
            </button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">
                veya
              </div>
            </div>

            <a
              href="https://www.rehapp.com.tr"
              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              Rehapp ile Giriş Yap
            </a>
          </form>
        )}
      </div>
    </div>
  );
}

export default function GirisPage() {
  return (
    <Suspense>
      <GirisForm />
    </Suspense>
  );
}
