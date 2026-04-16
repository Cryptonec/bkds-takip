'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  LayoutDashboard, Users,
  Upload, FileBarChart, Settings, LogOut, Activity, Tv2, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/program', label: 'Program', icon: CalendarDays },
  { href: '/ogrenciler', label: 'Öğrenciler', icon: Users },
  { href: '/import', label: 'Lila İçe Aktar', icon: Upload },
  { href: '/ekran', label: 'Bildirim Ekranı', icon: Tv2 },
  { href: '/raporlar', label: 'Raporlar', icon: FileBarChart },
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-400" />
          <div>
            <p className="font-bold text-sm leading-tight">BKDS Takip</p>
            <p className="text-xs text-slate-400">Rehab Merkezi</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-slate-700">
        <div className="px-3 py-2 text-xs text-slate-400 truncate mb-2">
          {session?.user?.name}
          <br />
          <span className="text-slate-500">{(session?.user as any)?.role}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/giris' })}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
