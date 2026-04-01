import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/giris',
    error: '/giris',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-posta', type: 'email' },
        password: { label: 'Şifre', type: 'password' },
        organizationSlug: { label: 'Kurum', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // organizationSlug yoksa (eski davranış): tek kurumlu mod
        const where = credentials.organizationSlug
          ? {
              email_organizationId: {
                email: credentials.email,
                organizationId: (
                  await prisma.organization.findUnique({
                    where: { slug: credentials.organizationSlug },
                    select: { id: true },
                  })
                )?.id ?? '',
              },
            }
          : undefined;

        let user = null;
        if (where) {
          user = await prisma.user.findUnique({ where, include: { organization: { select: { id: true, slug: true } } } });
        } else {
          // Tek kurum modunda ilk aktif kullanıcıyı bul
          user = await prisma.user.findFirst({
            where: { email: credentials.email, active: true },
            include: { organization: { select: { id: true, slug: true } } },
          });
        }

        if (!user || !user.active) return null;
        if (!user.password) return null; // SSO kullanıcısı şifre ile giremez

        const passwordValid = await bcrypt.compare(credentials.password, user.password);
        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          organizationSlug: user.organization.slug,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
        token.organizationId = (user as any).organizationId;
        token.organizationSlug = (user as any).organizationSlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationSlug = token.organizationSlug;
      }
      return session;
    },
  },
};

/** Session'dan organizationId'yi güvenli çek */
export function getOrgId(session: any): string {
  const id = session?.user?.organizationId;
  if (!id) throw new Error('organizationId bulunamadı');
  return id as string;
}
