import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || role !== 'superadmin') {
    redirect('/giris');
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-3">
        <span className="text-lg font-bold">BKDS Takip</span>
        <span className="text-slate-400 text-sm">/ Superadmin</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
