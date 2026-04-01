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

        try {
          // Önce multi-tenant modunu dene (Organization modeli mevcutsa)
          const orgSlug = credentials.organizationSlug;

          let user: any = null;

          if (orgSlug) {
            const org = await (prisma as any).organization?.findUnique({
              where: { slug: orgSlug },
              select: { id: true, slug: true },
            });
            if (org) {
              user = await prisma.user.findFirst({
                where: { email: credentials.email, active: true, organizationId: org.id } as any,
                include: { organization: { select: { id: true, slug: true } } } as any,
              });
            }
          } else {
            // organizationSlug yok → ilk eşleşen aktif kullanıcıyı getir
            user = await prisma.user.findFirst({
              where: { email: credentials.email, active: true } as any,
              include: { organization: { select: { id: true, slug: true } } } as any,
            });
          }

          if (!user || !user.active) return null;
          if (!user.password) return null;

          const passwordValid = await bcrypt.compare(credentials.password, user.password);
          if (!passwordValid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            organizationId: (user as any).organizationId ?? null,
            organizationSlug: (user as any).organization?.slug ?? null,
          };
        } catch {
          // Multi-tenant migration henüz uygulanmamış — eski tek-kiracı moduna dön
          const user = await prisma.user.findFirst({
            where: { email: credentials.email } as any,
          });

          if (!user || !(user as any).active) return null;
          if (!(user as any).password) return null;

          const passwordValid = await bcrypt.compare(credentials.password, (user as any).password);
          if (!passwordValid) return null;

          return {
            id: (user as any).id,
            email: (user as any).email,
            name: (user as any).name,
            role: (user as any).role,
            organizationId: null,
            organizationSlug: null,
          };
        }
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
