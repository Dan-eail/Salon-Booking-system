import type { LucideIcon } from 'lucide-react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { cx } from '@/lib/utils';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

/** Guards a route tree: signed-out users go to sign-in (and come back); wrong roles see the 403 page. */
export function RequireRole({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

export function DashboardShell({ items, title, aside }: { items: NavItem[]; title: string; aside?: React.ReactNode }) {
  const link = ({ isActive }: { isActive: boolean }) => cx('flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors', isActive ? 'bg-plum text-ivory shadow-soft' : 'text-plum hover:bg-plum/6');
  return (
    <div className="min-h-dvh bg-ivory">
      <Header />
      <div className="container-page grid gap-8 py-8 lg:grid-cols-[250px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 hidden px-3.5 font-display text-xl text-plum lg:block">{title}</p>
          {aside}
          <nav aria-label={title} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={(s) => cx(link(s), 'shrink-0')}><Icon className="h-[18px] w-[18px]" aria-hidden />{label}</NavLink>
            ))}
          </nav>
        </aside>
        <main id="main" className="min-w-0"><Outlet /></main>
      </div>
    </div>
  );
}
