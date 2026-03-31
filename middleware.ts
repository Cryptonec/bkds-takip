import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/giris' },
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/canli/:path*',
    '/ogrenciler/:path*',
    '/personel/:path*',
    '/import/:path*',
    '/raporlar/:path*',
    '/ayarlar/:path*',
  ],
};
