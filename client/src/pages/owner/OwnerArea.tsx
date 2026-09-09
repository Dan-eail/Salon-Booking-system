import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, ClipboardList, LayoutDashboard, MessageSquareText, Scissors, Settings2, Users } from 'lucide-react';
import { Link, Route, Routes } from 'react-router-dom';
import { DashboardShell, type NavItem } from '@/components/layout/Dashboard';
import { Badge, Card, Empty, ErrorState, PageTitle, Select, Skeleton, Spinner, StatusBadge } from '@/components/ui';
import { get } from '@/lib/api';
import { fmtDateTime, fmtTime, money } from '@/lib/format';
import type { ApptRow, Summary } from '@/lib/types';
import { SalonProvider, useSalon } from './context';
import Appointments from './Appointments';
import Services from './Services';
import StaffPage from './Staff';
import SalonProfile from './SalonProfile';
import { Reports, Reviews } from './Reports';
import { ButtonLink } from '@/components/ui';

const ownerNav: NavItem[] = [
  { to: '/salon', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/salon/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/salon/services', label: 'Services', icon: Scissors }, { to: '/salon/staff', label: 'Staff', icon: Users }, { to: '/salon/profile', label: 'Salon profile', icon: Settings2 },
  { to: '/salon/reports', label: 'Reports', icon: BarChart3 }, { to: '/salon/reviews', label: 'Reviews', icon: MessageSquareText },
];
const staffNav = ownerNav.slice(0, 2);

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-ink-soft">{label}</p><p className="mt-1 font-display text-3xl text-plum">{value}</p>{note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}</div>;
}

function ApptLine({ a }: { a: ApptRow }) {
  return <li className="flex items-center gap-4 py-3"><span className="w-16 shrink-0 font-semibold text-plum">{fmtTime(a.startAt)}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.serviceName}</span><span className="block truncate text-sm text-ink-soft">{a.guestName} · {a.staffName}</span></span><StatusBadge status={a.status} /></li>;
}

function Overview() {
  const { salon, base } = useSalon();
  const q = useQuery({ queryKey: ['owner', salon.id, 'overview'], queryFn: () => get<{ today: string; todays: ApptRow[]; upcoming: ApptRow[]; recent: ApptRow[]; pendingApprovals: number; last30Days: Summary }>(`${base}/overview`) });
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  const d = q.data, s = d.last30Days;
  return (
    <>
      <PageTitle title={`Today at ${salon.name}`} sub={salon.status === 'PENDING' ? undefined : 'Your diary, bookings and the last 30 days at a glance.'} />
      {salon.status === 'PENDING' && <div className="mb-6 rounded-2xl border border-gold/40 bg-gold/10 p-5"><p className="font-semibold text-plum">Your salon is awaiting approval</p><p className="mt-1 text-[15px]">Add services, staff and opening hours. Once the platform team approves your salon it appears to customers. You need at least one active service.</p><div className="mt-3 flex gap-2"><ButtonLink to="/salon/services" size="sm">Add services</ButtonLink><ButtonLink to="/salon/staff" size="sm" variant="outline">Add staff</ButtonLink></div></div>}
      {salon.status === 'SUSPENDED' && <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-5"><p className="font-semibold text-danger">Your salon is suspended and hidden from customers.</p><p className="mt-1 text-[15px]">Contact the platform team to resolve this.</p></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today’s appointments" value={d.todays.length} /><Stat label="Awaiting your approval" value={d.pendingApprovals} note={d.pendingApprovals ? 'Review in Appointments' : undefined} />
        <Stat label="Completion rate (30 days)" value={`${s.rates.completionPct}%`} note={`${s.totals.completed} completed · ${s.totals.cancelled + s.totals.rejected} cancelled or declined`} />
        <Stat label="Booked value (30 days)" value={money(s.bookingValueEtb)} note={`Not collected money. Recorded payments: ${money(s.recordedRevenueEtb)}`} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card><h2 className="text-2xl">Today</h2>{d.todays.length ? <ul className="mt-2 divide-y divide-line">{d.todays.map((a) => <ApptLine key={a.id} a={a} />)}</ul> : <p className="mt-3 text-ink-soft">Nothing booked today.</p>}</Card>
        <Card><h2 className="text-2xl">Coming up this week</h2>{d.upcoming.length ? <ul className="mt-2 divide-y divide-line">{d.upcoming.map((a) => <li key={a.id} className="flex items-center gap-3 py-3"><span className="w-24 shrink-0 text-sm text-ink-soft">{fmtDateTime(a.startAt)}</span><span className="min-w-0 flex-1 truncate">{a.serviceName} · {a.guestName}</span><StatusBadge status={a.status} /></li>)}</ul> : <p className="mt-3 text-ink-soft">No bookings in the next 7 days.</p>}</Card>
        <Card><h2 className="text-2xl">Popular services</h2>{s.popularServices.length ? <ol className="mt-3 space-y-2">{s.popularServices.slice(0, 5).map((p) => <li key={p.name} className="flex justify-between gap-3"><span>{p.name}</span><span className="text-ink-soft">{p.bookings} booking{p.bookings === 1 ? '' : 's'}</span></li>)}</ol> : <p className="mt-3 text-ink-soft">Popular services appear once you have bookings.</p>}</Card>
        <Card><h2 className="text-2xl">Recent customer activity</h2>{d.recent.length ? <ul className="mt-2 divide-y divide-line">{d.recent.slice(0, 6).map((a) => <li key={a.id} className="py-3 text-[15px]"><span className="font-medium">{a.guestName}</span> booked {a.serviceName} <span className="text-ink-soft">for {fmtDateTime(a.startAt)}</span></li>)}</ul> : <p className="mt-3 text-ink-soft">No activity yet.</p>}</Card>
      </div>
      <p className="mt-6 text-sm text-ink-soft"><Link to="/salon/reports" className="font-semibold text-burgundy hover:underline">Full reports and CSV export</Link></p>
    </>
  );
}

function Frame() {
  const { salon, salons, select, isOwner } = useSalon();
  return (
    <DashboardShell items={isOwner ? ownerNav : staffNav} title="Salon dashboard" aside={
      <div className="mb-4 space-y-2 px-1">
        {salons.length > 1 ? <Select label="Salon" value={salon.id} onChange={(e) => select(e.target.value)}>{salons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select> : <p className="truncate px-2.5 text-sm font-semibold text-plum">{salon.name}</p>}
        <div className="flex flex-wrap gap-1.5 px-2.5"><Badge tone={salon.status === 'ACTIVE' ? 'ok' : salon.status === 'PENDING' ? 'warn' : 'danger'}>{salon.status === 'ACTIVE' ? 'Live' : salon.status === 'PENDING' ? 'Awaiting approval' : 'Suspended'}</Badge>{!isOwner && <Badge>Staff access</Badge>}{salon.isDemo && <Badge tone="gold">Demo</Badge>}</div>
        {salon.status === 'ACTIVE' && <Link to={`/salons/${salon.slug}`} className="block px-2.5 text-sm font-semibold text-burgundy hover:underline" target="_blank">Preview public page</Link>}
      </div>} />
  );
}

export default function OwnerArea() {
  return (
    <SalonProvider>
      {({ loading, error, empty }) => loading ? <Spinner /> : error ? <div className="container-page py-16"><ErrorState error={error} /></div> : empty ? (
        <div className="container-page py-16"><Empty icon={<ClipboardList className="h-8 w-8" />} title="No salon is linked to your account" body="Salon owners create a salon when they register. Staff members are invited by their salon owner." action={<ButtonLink to="/register?type=owner">Register a salon</ButtonLink>} /></div>
      ) : (
        <Routes>
          <Route element={<Frame />}>
            <Route index element={<Overview />} /><Route path="appointments" element={<Appointments />} /><Route path="services" element={<Services />} />
            <Route path="staff" element={<StaffPage />} /><Route path="profile" element={<SalonProfile />} /><Route path="reports" element={<Reports />} /><Route path="reviews" element={<Reviews />} />
            <Route path="*" element={<Empty title="Page not found" action={<ButtonLink to="/salon">Back to overview</ButtonLink>} />} />
          </Route>
        </Routes>
      )}
    </SalonProvider>
  );
}
