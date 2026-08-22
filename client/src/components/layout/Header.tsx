import * as Menu from '@radix-ui/react-dropdown-menu';
import { Bell, CalendarCheck, ChevronDown, Heart, LayoutDashboard, LogOut, MapPin, Menu as MenuIcon, Search, Shield, User as UserIcon, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Art';
import { Button, ButtonLink } from '@/components/ui';
import { useUnread } from '@/hooks/queries';
import { useI18n } from '@/i18n';
import { homeFor, useAuth } from '@/lib/auth';
import { cx } from '@/lib/utils';
import { useMeta } from '@/hooks/queries';

const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-blush-soft';

export function LocationPicker() {
  const { data } = useMeta();
  const navigate = useNavigate();
  const hoods = data?.locations ?? [];
  return (
    <Menu.Root>
      <Menu.Trigger className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-plum hover:bg-plum/5 lg:flex" aria-label="Choose area">
        <MapPin className="h-4 w-4 text-burgundy" aria-hidden />Addis Ababa<ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={8} className="z-50 max-h-80 min-w-52 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-lift">
          <Menu.Item className={item} onSelect={() => navigate('/salons')}>All of Addis Ababa</Menu.Item>
          {hoods.map((l) => <Menu.Item key={l.id} className={item} onSelect={() => navigate(`/salons?neighborhood=${encodeURIComponent(l.neighborhood)}`)}>{l.neighborhood}</Menu.Item>)}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function LangToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === 'en' ? 'am' : 'en')} className="rounded-full px-3 py-2 text-sm font-semibold text-plum hover:bg-plum/5" aria-label={locale === 'en' ? 'Switch to Amharic' : 'Switch to English'}>
      {locale === 'en' ? 'አማ' : 'EN'}
    </button>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const unread = useUnread();
  if (!user) return null;
  const first = user.fullName.split(' ')[0];
  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-2 rounded-full border border-plum/20 py-1 pl-1 pr-3 text-sm font-semibold text-plum hover:border-plum/50" aria-label="Account menu">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-plum text-sm text-ivory">{first[0]?.toUpperCase()}</span>
        <span className="hidden max-w-24 truncate sm:inline">{first}</span><ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="z-50 min-w-60 rounded-xl border border-line bg-white p-1.5 shadow-lift">
          <div className="px-3 pb-2 pt-1.5"><p className="truncate text-sm font-semibold text-plum">{user.fullName}</p><p className="truncate text-xs text-ink-soft">{user.email}</p></div>
          <Menu.Separator className="my-1 h-px bg-line" />
          {user.role === 'ADMIN' && <Menu.Item className={item} onSelect={() => navigate('/admin')}><Shield className="h-4 w-4" aria-hidden />{t('nav.admin')}</Menu.Item>}
          {(user.role === 'OWNER' || user.role === 'STAFF' || user.role === 'ADMIN') && <Menu.Item className={item} onSelect={() => navigate('/salon')}><LayoutDashboard className="h-4 w-4" aria-hidden />{t('nav.manage')}</Menu.Item>}
          <Menu.Item className={item} onSelect={() => navigate('/dashboard')}><CalendarCheck className="h-4 w-4" aria-hidden />{t('nav.bookings')}</Menu.Item>
          <Menu.Item className={item} onSelect={() => navigate('/dashboard/favorites')}><Heart className="h-4 w-4" aria-hidden />{t('nav.favorites')}</Menu.Item>
          <Menu.Item className={item} onSelect={() => navigate('/dashboard/notifications')}><Bell className="h-4 w-4" aria-hidden />{t('nav.notifications')}{!!unread.data && <span className="ml-auto rounded-full bg-burgundy px-2 text-xs text-ivory">{unread.data}</span>}</Menu.Item>
          <Menu.Item className={item} onSelect={() => navigate('/dashboard/profile')}><UserIcon className="h-4 w-4" aria-hidden />{t('nav.profile')}</Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item className={cx(item, 'text-danger')} onSelect={async () => { await logout(); navigate('/'); }}><LogOut className="h-4 w-4" aria-hidden />{t('nav.signOut')}</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Header() {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const unread = useUnread();
  const link = ({ isActive }: { isActive: boolean }) => cx('rounded-full px-3 py-2 text-sm font-medium', isActive ? 'text-burgundy' : 'text-plum hover:bg-plum/5');
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ivory/92 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-2">
        <Link to="/" aria-label="Belle Ethiopia home" className="mr-2 shrink-0"><Logo /></Link>
        <div className="hidden items-center md:flex"><LocationPicker /><NavLink to="/salons" className={link}>{t('nav.salons')}</NavLink><NavLink to="/for-salons" className={link}>{t('nav.forOwners')}</NavLink></div>
        <div className="ml-auto flex items-center gap-1.5">
          <ButtonLink to="/salons" variant="ghost" size="icon" aria-label={t('common.search')} className="md:hidden"><Search className="h-5 w-5" /></ButtonLink>
          <LangToggle />
          {user && <Link to="/dashboard/notifications" className="relative hidden rounded-full p-2 text-plum hover:bg-plum/5 sm:block" aria-label={`Notifications${unread.data ? `, ${unread.data} unread` : ''}`}>
            <Bell className="h-5 w-5" />{!!unread.data && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-burgundy ring-2 ring-ivory" />}</Link>}
          {ready && (user ? <AccountMenu /> : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <ButtonLink to="/login" variant="ghost" size="sm">{t('nav.signIn')}</ButtonLink>
              <ButtonLink to="/register" size="sm">{t('nav.register')}</ButtonLink>
            </div>
          ))}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</Button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-ivory px-4 pb-5 pt-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1" onClick={() => setOpen(false)}>
            <NavLink to="/salons" className={link}>{t('nav.salons')}</NavLink>
            <NavLink to="/for-salons" className={link}>{t('nav.forOwners')}</NavLink>
            {!user && <div className="mt-3 grid grid-cols-2 gap-2"><ButtonLink to="/login" variant="outline">{t('nav.signIn')}</ButtonLink><ButtonLink to="/register">{t('nav.register')}</ButtonLink></div>}
            {user && <Link to={homeFor(user)} className={link({ isActive: false })}>{t('nav.bookings')}</Link>}
          </div>
        </nav>
      )}
    </header>
  );
}
