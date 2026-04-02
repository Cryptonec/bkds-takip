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
        ssoToken: { label: 'SSO Token', type: 'text' },
      },
      async authorize(credentials) {
        // SSO token ile giriş
        if (credentials?.ssoToken) {
          const record = await prisma.ssoToken.findUnique({
            where: { token: credentials.ssoToken },
            include: { organization: true },
          });

          if (!record) return null;
          if (record.usedAt) return null; // tek kullanımlık
          if (record.expiresAt < new Date()) return null;

          await prisma.ssoToken.update({
            where: { id: record.id },
            data: { usedAt: new Date() },
          });

          // Org'un admin kullanıcısını bul
          const orgAdmin = await prisma.user.findFirst({
            where: { organizationId: record.organizationId, role: 'admin', active: true },
          });

          if (orgAdmin) {
            return {
              id: orgAdmin.id,
              email: orgAdmin.email,
              name: orgAdmin.name,
              role: orgAdmin.role as string,
              organizationId: record.organizationId,
              organizationSlug: record.organization.slug,
            };
          }

          // Admin yoksa token'ın role'ü ile sanal oturum
          return {
            id: `sso-${record.organizationId}`,
            email: `sso@${record.organization.slug}`,
            name: record.organization.name,
            role: record.role as string,
            organizationId: record.organizationId,
            organizationSlug: record.organization.slug,
          };
        }

        // Normal e-posta/şifre girişi
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        });

        if (!user || !user.active) return null;

        const passwordValid = await bcrypt.compare(credentials.password, user.password);
        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as string,
          organizationId: user.organizationId ?? undefined,
          organizationSlug: user.organization?.slug ?? undefined,
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
