/**
 * GET /api/sso/callback?token=<token>
 * Kullanıcıyı SSO token ile otomatik giriş yapan sayfa.
 * NextAuth signIn sayfasına yönlendirir; token credentials ile submit edilir.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/giris?error=sso_missing_token', req.url));
  }

  // Client-side form submit için HTML sayfası döndür
  // NextAuth credentials provider'ı POST /api/auth/callback/credentials bekler
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>Giriş yapılıyor...</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .card { text-align: center; padding: 2rem; background: white; border-radius: 12px;
            box-shadow: 0 1px 8px rgba(0,0,0,0.1); }
    .spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb;
               border-top-color: #3b82f6; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <p>Giriş yapılıyor, lütfen bekleyin…</p>
  </div>
  <form id="f" method="POST" action="/api/auth/callback/credentials" style="display:none">
    <input name="ssoToken" value="${token.replace(/[^a-f0-9]/g, '')}" />
    <input name="csrfToken" id="csrf" />
    <input name="callbackUrl" value="/" />
    <input name="json" value="true" />
  </form>
  <script>
    (async () => {
      const r = await fetch('/api/auth/csrf');
      const { csrfToken } = await r.json();
      document.getElementById('csrf').value = csrfToken;
      document.getElementById('f').submit();
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
