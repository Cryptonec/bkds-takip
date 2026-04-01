import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;

    // superadmin dışında /admin/* rotalarını engelle
    if (req.nextUrl.pathname.startsWith('/admin') && token?.role !== 'superadmin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    pages: { signIn: '/giris' },
    callbacks: {
      authorized({ token }) {
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/canli/:path*',
    '/ogrenciler/:path*',
    '/personel/:path*',
    '/import/:path*',
    '/raporlar/:path*',
    '/ayarlar/:path*',
    '/ekran/:path*',
    '/admin/:path*',
  ],
};
