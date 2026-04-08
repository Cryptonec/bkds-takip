'use client';
import { useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Loader2 } from 'lucide-react';

function GirisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) return;

    signIn('credentials', { ssoToken: token, redirect: false }).then((result) => {
      if (result?.error) {
        router.replace('/giris?error=SSOFailed');
      } else {
        router.push('/dashboard');
      }
    });
  }, [searchParams, router]);

  const token = searchParams.get('token');

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

        {token ? (
          <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm">Giriş yapılıyor...</p>
          </div>
        ) : (
          <div className="text-center py-6 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
                {error === 'SSOFailed'
                  ? 'Bağlantı süresi dolmuş. Lütfen rehapp üzerinden tekrar giriş yapın.'
                  : 'Giriş başarısız. Lütfen tekrar deneyin.'}
              </div>
            )}
            <p className="text-gray-600 text-sm">
              BKDS Takip&apos;e erişmek için rehapp uygulaması üzerinden giriş yapın.
            </p>
          </div>
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
