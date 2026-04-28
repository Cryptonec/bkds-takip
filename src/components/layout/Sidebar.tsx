'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  LayoutDashboard, Monitor, Users, GraduationCap,
  Upload, FileBarChart, Settings, LogOut, Activity, Tv2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/canli', label: 'Canlı Takip', icon: Monitor },
  { href: '/ogrenciler', label: 'Öğrenciler', icon: Users },
  { href: '/personel', label: 'Personel', icon: GraduationCap },
  { href: '/import', label: 'Lila İçe Aktar', icon: Upload },
  { href: '/ekran', label: 'Bildirim Ekranı', icon: Tv2 },
  { href: '/raporlar', label: 'Raporlar', icon: FileBarChart },
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
];

const SIDEBAR_KEY = 'sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }, [collapsed, mounted]);

  return (
    <>
      {/* Açık sidebar */}
      <aside className={cn(
        'relative flex flex-col min-h-screen bg-slate-900 text-slate-100 transition-[width] duration-200 ease-out shrink-0',
        collapsed ? 'w-14' : 'w-60',
      )}>
        {/* Collapse butonu — sidebar kenarına yerleştirilmiş kalıcı görünür buton */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="absolute -right-3 top-7 z-10 w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg border-2 border-slate-900 flex items-center justify-center transition-all hover:scale-110 touch-manipulation"
          title={collapsed ? 'Menüyü aç' : 'Menüyü daralt'}
          aria-pressed={collapsed}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Logo */}
        <div className={cn(
          'py-4 border-b border-slate-700 flex items-center gap-2',
          collapsed ? 'px-3 justify-center' : 'px-3',
        )}>
          <Activity className="w-6 h-6 text-blue-400 shrink-0" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate">BKDS Takip</p>
              <p className="text-xs text-slate-400 truncate">Rehab Merkezi</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                prefetch={false}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm touch-manipulation select-none',
                  collapsed && 'justify-center px-2',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white active:bg-slate-700',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="px-2 py-4 border-t border-slate-700">
          {!collapsed && (
            <div className="px-3 py-2 text-xs text-slate-400 truncate mb-2">
              {session?.user?.name}
              <br />
              <span className="text-slate-500">{(session?.user as any)?.role}</span>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/giris' })}
            title={collapsed ? 'Çıkış Yap' : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white active:bg-slate-700 w-full transition-colors touch-manipulation',
              collapsed && 'justify-center px-2',
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && 'Çıkış Yap'}
          </button>
        </div>
      </aside>
    </>
  );
}
