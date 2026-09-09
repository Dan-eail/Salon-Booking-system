import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, BarChart3, CalendarDays, Gauge, History, Layers, MessageSquareWarning, Percent, Plus, Settings, Store, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { DashboardShell, type NavItem } from '@/components/layout/Dashboard';
import { Badge, Button, ButtonLink, Card, Confirm, Empty, ErrorState, FormError, Input, Modal, PageTitle, Pagination, Select, Skeleton, StatusBadge, Stars, Switch, Textarea } from '@/components/ui';
import { del, get, getPage, patch, post, put } from '@/lib/api';
import { addDays, fmtDate, fmtDateTime, fromLocalInput, localDate, money, toLocalInput } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import type { AppointmentStatus, Role } from '@/lib/types';
import { fieldMsg } from '../owner/util';

const nav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true }, { to: '/admin/salons', label: 'Salons', icon: Store }, { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarDays }, { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareWarning }, { to: '/admin/categories', label: 'Categories', icon: Layers },
  { to: '/admin/promotions', label: 'Promotions', icon: Percent }, { to: '/admin/reports', label: 'Reports', icon: BarChart3 }, { to: '/admin/audit', label: 'Audit log', icon: History }, { to: '/admin/settings', label: 'Settings', icon: Settings },
];

/* ------------------------------------------------------------------ helpers */
function useList<T>(path: string, params: Record<string, unknown>) {
  const q = useQuery({ queryKey: ['admin', path, params], queryFn: () => getPage<T>(`/admin/${path}`, params) });
  return { q, rows: q.data?.data ?? [], meta: q.data?.meta };
}
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ['admin'] }); };

function Table({ head, children, loading, error, retry, empty, count }: { head: string[]; children: ReactNode; loading: boolean; error: unknown; retry: () => void; empty: string; count: number }) {
  if (error) return <ErrorState error={error} retry={retry} />;
  if (loading) return <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  if (count === 0) return <Empty title={empty} />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-[15px]">
        <thead className="border-b border-line bg-ivory-deep/60 text-sm text-ink-soft"><tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
const Search = ({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) => <Input label="Search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} wrapperClass="w-full sm:w-72" />;
const Td = ({ children, className = '' }: { children: ReactNode; className?: string }) => <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
const Pager = ({ meta, page, setPage }: { meta?: { totalPages: number; total: number }; page: number; setPage: (p: number) => void }) => meta && meta.totalPages > 1 ? <div className="mt-5"><Pagination page={page} totalPages={meta.totalPages} onChange={setPage} /></div> : null;

/* ------------------------------------------------------------------ Overview */
type Overview = { usersByRole: { role: string; n: number }[]; salonsByStatus: { status: string; n: number }[]; bookingsLast30Days: { status: string; n: number }[];
  pendingSalons: { id: string; name: string; neighborhood: string; createdAt: string }[]; recentAudit: { id: string; action: string; entityType: string; createdAt: string; actor: string | null }[]; reviews: { reviews: number; hidden: number } };
const sum = (a: { n: number }[]) => a.reduce((t, x) => t + x.n, 0);
const count = (a: { n: number; [k: string]: unknown }[], key: string, v: string) => a.find((x) => x[key] === v)?.n ?? 0;

function AdminOverview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<Overview>('/admin/overview') });
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  const d = q.data;
  const tile = (label: string, value: number | string, note?: string) => <div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-ink-soft">{label}</p><p className="mt-1 font-display text-3xl text-plum">{value}</p>{note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}</div>;
  return (
    <>
      <PageTitle title="Platform overview" sub="Live counts from the database." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tile('Users', sum(d.usersByRole), `${count(d.usersByRole, 'role', 'CUSTOMER')} customers · ${count(d.usersByRole, 'role', 'OWNER')} owners`)}
        {tile('Salons', sum(d.salonsByStatus), `${count(d.salonsByStatus, 'status', 'ACTIVE')} live · ${count(d.salonsByStatus, 'status', 'PENDING')} awaiting approval`)}
        {tile('Bookings (30 days)', sum(d.bookingsLast30Days), `${count(d.bookingsLast30Days, 'status', 'COMPLETED')} completed · ${count(d.bookingsLast30Days, 'status', 'CANCELLED')} cancelled`)}
        {tile('Reviews', d.reviews.reviews, `${d.reviews.hidden} hidden`)}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card><h2 className="text-2xl">Awaiting approval</h2>
          {d.pendingSalons.length === 0 ? <p className="mt-3 text-ink-soft">No salons are waiting.</p> : <ul className="mt-2 divide-y divide-line">{d.pendingSalons.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-3"><span><span className="block font-medium">{s.name}</span><span className="text-sm text-ink-soft">{s.neighborhood} · applied {fmtDate(s.createdAt)}</span></span></li>)}</ul>}
          <div className="mt-3"><ButtonLink to="/admin/salons" variant="outline" size="sm">Review salons</ButtonLink></div></Card>
        <Card><h2 className="text-2xl">Recent admin activity</h2>
          {d.recentAudit.length === 0 ? <p className="mt-3 text-ink-soft">Nothing yet.</p> : <ul className="mt-2 divide-y divide-line">{d.recentAudit.map((a) => <li key={a.id} className="py-3 text-[15px]"><span className="font-medium">{a.action}</span> <span className="text-ink-soft">· {a.actor ?? 'system'} · {fmtDateTime(a.createdAt)}</span></li>)}</ul>}</Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Salons */
type SalonRow = { id: string; name: string; slug: string; neighborhood: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; isVerified: boolean; isDemo: boolean; avgRating: string; reviewCount: number; bookingCount: number; ownerName: string; ownerEmail: string; serviceCount: number; createdAt: string };
function Salons() {
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const { q: query, rows, meta } = useList<SalonRow>('salons', { page, pageSize: 15, status: status || undefined, q: q || undefined });
  const refresh = useRefresh();
  const [target, setTarget] = useState<{ salon: SalonRow; status: SalonRow['status'] } | null>(null);
  const [note, setNote] = useState('');
  const set = useMutation({ mutationFn: () => patch(`/admin/salons/${target!.salon.id}/status`, { status: target!.status, note: note.trim() || undefined }), onSuccess: () => { setTarget(null); setNote(''); void refresh(); toast.success('Salon updated'); } });
  const verify = useMutation({ mutationFn: (s: SalonRow) => patch(`/admin/salons/${s.id}/verify`, { isVerified: !s.isVerified }), onSuccess: () => void refresh() });
  const verb = { ACTIVE: 'Approve and publish', SUSPENDED: 'Suspend', PENDING: 'Move back to review' };
  return (
    <>
      <PageTitle title="Salons" sub="Approve new salons, suspend problem ones, and verify real businesses." />
      <div className="mb-5 flex flex-wrap items-end gap-3"><Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or neighbourhood" />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="PENDING">Awaiting approval</option><option value="ACTIVE">Live</option><option value="SUSPENDED">Suspended</option></Select></div>
      <Table head={['Salon', 'Owner', 'Status', 'Activity', '']} loading={query.isLoading} error={query.error} retry={() => void query.refetch()} empty="No salons match" count={rows.length}>
        {rows.map((s) => (
          <tr key={s.id}>
            <Td><p className="font-medium">{s.name}</p><p className="text-sm text-ink-soft">{s.neighborhood}</p><div className="mt-1 flex gap-1.5">{s.isDemo && <Badge tone="gold">Demo</Badge>}{s.isVerified && <Badge tone="ok"><BadgeCheck className="h-3 w-3" />Verified</Badge>}</div></Td>
            <Td><p>{s.ownerName}</p><p className="text-sm text-ink-soft">{s.ownerEmail}</p></Td>
            <Td><Badge tone={s.status === 'ACTIVE' ? 'ok' : s.status === 'PENDING' ? 'warn' : 'danger'}>{s.status === 'ACTIVE' ? 'Live' : s.status === 'PENDING' ? 'Awaiting approval' : 'Suspended'}</Badge></Td>
            <Td className="text-sm text-ink-soft">{s.serviceCount} active service{s.serviceCount === 1 ? '' : 's'}<br />{s.bookingCount} bookings · {s.reviewCount} reviews</Td>
            <Td><div className="flex flex-wrap justify-end gap-1.5">
              {s.status !== 'ACTIVE' && <Button size="sm" onClick={() => setTarget({ salon: s, status: 'ACTIVE' })}>Approve</Button>}
              {s.status !== 'SUSPENDED' && <Button size="sm" variant="dangerOutline" onClick={() => setTarget({ salon: s, status: 'SUSPENDED' })}>Suspend</Button>}
              <Button size="sm" variant="ghost" disabled={s.isDemo} title={s.isDemo ? 'Demo salons cannot be verified' : undefined} loading={verify.isPending && verify.variables?.id === s.id} onClick={() => verify.mutate(s)}>{s.isVerified ? 'Unverify' : 'Verify'}</Button>
            </div></Td>
          </tr>
        ))}
      </Table>
      {verify.isError && <div className="mt-3"><FormError error={verify.error} /></div>}
      <Pager meta={meta} page={page} setPage={setPage} />
      <Modal open={!!target} onOpenChange={(o) => !o && setTarget(null)} title={target ? `${verb[target.status]}: ${target.salon.name}` : ''} description="The owner is notified.">
        <Textarea label="Note to the owner" optional rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-3"><FormError error={set.error} /></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => setTarget(null)}>Back</Button><Button variant={target?.status === 'SUSPENDED' ? 'danger' : 'primary'} loading={set.isPending} onClick={() => set.mutate()}>{target ? verb[target.status] : ''}</Button></div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ Users */
type UserRow = { id: string; email: string; phone: string | null; fullName: string; role: Role; isActive: boolean; lastLoginAt: string | null; createdAt: string };
function UsersPage() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1); const [role, setRole] = useState(''); const [q, setQ] = useState('');
  const { q: query, rows, meta } = useList<UserRow>('users', { page, pageSize: 15, role: role || undefined, q: q || undefined });
  const refresh = useRefresh();
  const m = useMutation({ mutationFn: (v: { id: string; role?: Role; isActive?: boolean }) => patch(`/admin/users/${v.id}`, { role: v.role, isActive: v.isActive }), onSuccess: () => { void refresh(); toast.success('User updated'); } });
  return (
    <>
      <PageTitle title="Users" sub="Change roles or block accounts. Blocked users are signed out everywhere." />
      <div className="mb-5 flex flex-wrap items-end gap-3"><Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, email or phone" />
        <Select label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option>{(['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN'] as Role[]).map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}</Select></div>
      <FormError error={m.error} />
      <Table head={['Person', 'Role', 'Last sign-in', 'Status']} loading={query.isLoading} error={query.error} retry={() => void query.refetch()} empty="No users match" count={rows.length}>
        {rows.map((u) => (
          <tr key={u.id}>
            <Td><p className="font-medium">{u.fullName}{u.id === me?.id && <span className="ml-2 text-sm text-ink-soft">(you)</span>}</p><p className="text-sm text-ink-soft">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p></Td>
            <Td><select aria-label={`Role for ${u.fullName}`} className="h-10 rounded-lg border border-line bg-white px-2 text-sm" value={u.role} disabled={u.id === me?.id || m.isPending} onChange={(e) => m.mutate({ id: u.id, role: e.target.value as Role })}>{(['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN'] as Role[]).map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}</select></Td>
            <Td className="text-sm text-ink-soft">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</Td>
            <Td><Switch label={u.isActive ? 'Active' : 'Blocked'} checked={u.isActive} disabled={u.id === me?.id || m.isPending} onCheckedChange={(v) => m.mutate({ id: u.id, isActive: v })} /></Td>
          </tr>
        ))}
      </Table>
      <Pager meta={meta} page={page} setPage={setPage} />
    </>
  );
}

/* ------------------------------------------------------------------ Bookings */
type BookRow = { id: string; reference: string; status: AppointmentStatus; startAt: string; serviceName: string; priceEtb: string; guestName: string; guestPhone: string; paymentStatus: string; salonName: string };
function Bookings() {
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const { q: query, rows, meta } = useList<BookRow>('bookings', { page, pageSize: 15, status: status || undefined, q: q || undefined });
  return (
    <>
      <PageTitle title="Bookings" sub="Read-only view across all salons." />
      <div className="mb-5 flex flex-wrap items-end gap-3"><Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Reference, name or phone" />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any</option>{(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'] as const).map((s) => <option key={s} value={s}>{s.replace('_', '-').toLowerCase()}</option>)}</Select></div>
      <Table head={['When', 'Booking', 'Salon', 'Status']} loading={query.isLoading} error={query.error} retry={() => void query.refetch()} empty="No bookings match" count={rows.length}>
        {rows.map((b) => <tr key={b.id}><Td className="whitespace-nowrap">{fmtDateTime(b.startAt)}</Td><Td><p className="font-medium">{b.serviceName} · {money(b.priceEtb)}</p><p className="text-sm text-ink-soft">{b.guestName} · {b.guestPhone} · {b.reference}</p></Td><Td>{b.salonName}</Td><Td><StatusBadge status={b.status} /></Td></tr>)}
      </Table>
      <Pager meta={meta} page={page} setPage={setPage} />
    </>
  );
}

/* ------------------------------------------------------------------ Reviews */
type RevRow = { id: string; rating: number; comment: string | null; isHidden: boolean; createdAt: string; salonName: string; reviewer: string };
function ReviewsAdmin() {
  const [page, setPage] = useState(1); const [hidden, setHidden] = useState(''); const [q, setQ] = useState('');
  const { q: query, rows, meta } = useList<RevRow>('reviews', { page, pageSize: 15, hidden: hidden || undefined, q: q || undefined });
  const refresh = useRefresh();
  const m = useMutation({ mutationFn: (r: RevRow) => patch(`/admin/reviews/${r.id}`, { isHidden: !r.isHidden }), onSuccess: () => void refresh() });
  return (
    <>
      <PageTitle title="Review moderation" sub="Hide reviews that break the rules. Hidden reviews stop counting toward a salon’s rating." />
      <div className="mb-5 flex flex-wrap items-end gap-3"><Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Comment or salon" />
        <Select label="Visibility" value={hidden} onChange={(e) => { setHidden(e.target.value); setPage(1); }}><option value="">All</option><option value="false">Visible</option><option value="true">Hidden</option></Select></div>
      <FormError error={m.error} />
      <Table head={['Review', 'Salon', 'Date', '']} loading={query.isLoading} error={query.error} retry={() => void query.refetch()} empty="No reviews match" count={rows.length}>
        {rows.map((r) => <tr key={r.id}><Td><Stars value={r.rating} size={14} /><p className="mt-1">{r.comment || <span className="text-ink-soft">No comment</span>}</p><p className="text-sm text-ink-soft">{r.reviewer}</p></Td><Td>{r.salonName}</Td><Td className="whitespace-nowrap text-sm text-ink-soft">{fmtDate(r.createdAt)}</Td>
          <Td><Button size="sm" variant={r.isHidden ? 'outline' : 'dangerOutline'} loading={m.isPending && m.variables?.id === r.id} onClick={() => m.mutate(r)}>{r.isHidden ? 'Show' : 'Hide'}</Button></Td></tr>)}
      </Table>
      <Pager meta={meta} page={page} setPage={setPage} />
    </>
  );
}

/* ------------------------------------------------------------------ Categories */
type Cat = { id: string; slug: string; name: string; nameAm: string | null; group: string; sortOrder: number; isActive: boolean; serviceCount: number };
function Categories() {
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => get<Cat[]>('/admin/categories') });
  const refresh = useRefresh();
  const [edit, setEdit] = useState<Cat | 'new' | null>(null);
  const [remove, setRemove] = useState<Cat | null>(null);
  const rm = useMutation({ mutationFn: (c: Cat) => del(`/admin/categories/${c.id}`), onSuccess: () => { setRemove(null); void refresh(); } });
  return (
    <>
      <PageTitle title="Service categories" action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add category</Button>} />
      <Table head={['Category', 'Group', 'Services', 'Status', '']} loading={q.isLoading} error={q.error} retry={() => void q.refetch()} empty="No categories" count={q.data?.length ?? 0}>
        {(q.data ?? []).map((c) => <tr key={c.id}><Td><p className="font-medium">{c.name}</p><p className="text-sm text-ink-soft">{c.nameAm ?? 'No Amharic name'} · {c.slug}</p></Td><Td className="capitalize">{c.group}</Td><Td>{c.serviceCount}</Td><Td>{c.isActive ? <Badge tone="ok">Active</Badge> : <Badge>Hidden</Badge>}</Td>
          <Td><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setRemove(c)}>Delete</Button></div></Td></tr>)}
      </Table>
      {edit && <CategoryForm existing={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <Confirm open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={`Delete ${remove?.name ?? ''}?`} body={remove && remove.serviceCount > 0 ? 'Categories that salons already use cannot be deleted. Hide it instead.' : 'This removes the category.'} confirmLabel="Delete" loading={rm.isPending} error={rm.error} onConfirm={() => remove && rm.mutate(remove)} />
    </>
  );
}
function CategoryForm({ existing, onClose }: { existing: Cat | null; onClose: () => void }) {
  const refresh = useRefresh();
  const [f, setF] = useState({ slug: existing?.slug ?? '', name: existing?.name ?? '', nameAm: existing?.nameAm ?? '', group: existing?.group ?? 'hair', sortOrder: String(existing?.sortOrder ?? 0), isActive: existing?.isActive ?? true });
  const m = useMutation({
    mutationFn: () => { const body = { name: f.name, nameAm: f.nameAm || null, group: f.group, sortOrder: Number(f.sortOrder), isActive: f.isActive }; return existing ? patch(`/admin/categories/${existing.id}`, body) : post('/admin/categories', { ...body, slug: f.slug }); },
    onSuccess: () => { void refresh(); onClose(); },
  });
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit category' : 'New category'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err('name')} />
        <Input label="Amharic name" optional value={f.nameAm} onChange={(e) => setF({ ...f, nameAm: e.target.value })} lang="am" />
        {!existing && <Input label="Slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} error={err('slug')} hint="Lowercase letters, numbers and dashes. Cannot be changed later." />}
        <div className="grid gap-4 sm:grid-cols-2"><Select label="Group" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="hair">Hair</option><option value="nails">Nails</option><option value="bridal">Bridal</option><option value="other">Other</option></Select>
          <Input label="Sort order" type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></div>
        <Switch label="Visible to customers" checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
        <FormError error={m.error} />
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={m.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Promotions */
type Promo = { id: string; salonId: string | null; salonName: string | null; title: string; description: string; type: 'PERCENT' | 'FIXED'; value: string; startsAt: string; endsAt: string; isActive: boolean; isFeatured: boolean };
function Promotions() {
  const q = useQuery({ queryKey: ['admin', 'promotions'], queryFn: () => get<Promo[]>('/admin/promotions') });
  const refresh = useRefresh();
  const [edit, setEdit] = useState<Promo | 'new' | null>(null);
  const [remove, setRemove] = useState<Promo | null>(null);
  const rm = useMutation({ mutationFn: (p: Promo) => del(`/admin/promotions/${p.id}`), onSuccess: () => { setRemove(null); void refresh(); } });
  const tog = useMutation({ mutationFn: (p: Promo) => patch(`/admin/promotions/${p.id}`, { isActive: !p.isActive }), onSuccess: () => void refresh() });
  return (
    <>
      <PageTitle title="Promotions" sub="Featured offers shown on the home page. Salon-specific promo prices are set by owners on their services." action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add promotion</Button>} />
      <Table head={['Promotion', 'Discount', 'Runs', 'Status', '']} loading={q.isLoading} error={q.error} retry={() => void q.refetch()} empty="No promotions yet" count={q.data?.length ?? 0}>
        {(q.data ?? []).map((p) => <tr key={p.id}><Td><p className="font-medium">{p.title}</p><p className="text-sm text-ink-soft">{p.salonName ?? 'Platform-wide'}</p></Td><Td>{p.type === 'PERCENT' ? `${Number(p.value)}%` : money(p.value)}</Td><Td className="whitespace-nowrap text-sm">{fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}</Td>
          <Td><div className="flex gap-1.5">{p.isActive ? <Badge tone="ok">Active</Badge> : <Badge>Off</Badge>}{p.isFeatured && <Badge tone="gold">Featured</Badge>}</div></Td>
          <Td><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" loading={tog.isPending && tog.variables?.id === p.id} onClick={() => tog.mutate(p)}>{p.isActive ? 'Turn off' : 'Turn on'}</Button><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setRemove(p)}>Delete</Button></div></Td></tr>)}
      </Table>
      {edit && <PromoForm existing={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <Confirm open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={`Delete “${remove?.title ?? ''}”?`} body="This removes the promotion for good." confirmLabel="Delete" loading={rm.isPending} error={rm.error} onConfirm={() => remove && rm.mutate(remove)} />
    </>
  );
}
function PromoForm({ existing, onClose }: { existing: Promo | null; onClose: () => void }) {
  const refresh = useRefresh();
  const [f, setF] = useState({ title: existing?.title ?? '', description: existing?.description ?? '', type: existing?.type ?? 'PERCENT', value: existing?.value ?? '', startsAt: existing ? toLocalInput(existing.startsAt) : `${localDate()}T00:00`, endsAt: existing ? toLocalInput(existing.endsAt) : `${addDays(localDate(), 30)}T23:59`, isActive: existing?.isActive ?? true, isFeatured: existing?.isFeatured ?? false });
  const m = useMutation({
    mutationFn: () => { const body = { title: f.title, description: f.description, value: f.value, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), isActive: f.isActive, isFeatured: f.isFeatured }; return existing ? patch(`/admin/promotions/${existing.id}`, body) : post('/admin/promotions', { ...body, type: f.type }); },
    onSuccess: () => { void refresh(); onClose(); },
  });
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit promotion' : 'New promotion'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={err('title')} />
        <Textarea label="Description" optional rows={2} maxLength={400} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={f.type} disabled={!!existing} onChange={(e) => setF({ ...f, type: e.target.value as 'PERCENT' | 'FIXED' })}><option value="PERCENT">Percent off</option><option value="FIXED">Fixed amount off (Br)</option></Select>
          <Input label={f.type === 'PERCENT' ? 'Percent' : 'Amount (Br)'} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} error={err('value')} />
          <Input label="Starts" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} error={err('startsAt')} />
          <Input label="Ends" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} error={err('endsAt')} />
        </div>
        <Switch label="Active" checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
        <Switch label="Feature on the home page" checked={f.isFeatured} onCheckedChange={(v) => setF({ ...f, isFeatured: v })} />
        <FormError error={m.error} />
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={m.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Settings */
function SettingsPage() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => get<Record<string, string>>('/admin/settings') });
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-64 w-full" />;
  return <SettingsForm initial={q.data} />;
}
function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ supportPhone: initial.supportPhone ?? '', supportEmail: initial.supportEmail ?? '', announcement: initial.announcement ?? '', defaultCity: initial.defaultCity ?? '' });
  const m = useMutation({ mutationFn: () => put('/admin/settings', f), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin'] }); void qc.invalidateQueries({ queryKey: ['meta'] }); toast.success('Settings saved'); } });
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <>
      <PageTitle title="Platform settings" sub="Shown to every visitor." />
      <Card className="max-w-2xl"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input label="Site-wide announcement" optional hint="A short banner, for example a holiday closure notice. Leave empty for none." maxLength={200} value={f.announcement} onChange={(e) => setF({ ...f, announcement: e.target.value })} error={err('announcement')} />
        <Input label="Support phone" optional value={f.supportPhone} onChange={(e) => setF({ ...f, supportPhone: e.target.value })} error={err('supportPhone')} />
        <Input label="Support email" optional type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} error={err('supportEmail')} />
        <Input label="Default city" optional value={f.defaultCity} onChange={(e) => setF({ ...f, defaultCity: e.target.value })} error={err('defaultCity')} />
        <FormError error={m.error} />
        <div className="flex justify-end"><Button type="submit" loading={m.isPending}>Save settings</Button></div>
      </form></Card>
    </>
  );
}

/* ------------------------------------------------------------------ Audit */
type AuditRow = { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; createdAt: string; actorName: string | null; actorEmail: string | null };
function Audit() {
  const [page, setPage] = useState(1); const [action, setAction] = useState('');
  const { q: query, rows, meta } = useList<AuditRow>('audit', { page, pageSize: 20, action: action || undefined });
  return (
    <>
      <PageTitle title="Audit log" sub="Sensitive actions are recorded with who did them and when." />
      <div className="mb-5"><Input label="Action starts with" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="e.g. admin." wrapperClass="w-full sm:w-72" /></div>
      <Table head={['When', 'Who', 'Action', 'Details']} loading={query.isLoading} error={query.error} retry={() => void query.refetch()} empty="No entries" count={rows.length}>
        {rows.map((a) => <tr key={a.id}><Td className="whitespace-nowrap text-sm">{fmtDateTime(a.createdAt)}</Td><Td>{a.actorName ?? <span className="text-ink-soft">system</span>}<p className="text-xs text-ink-soft">{a.actorEmail}</p></Td><Td className="font-mono text-sm">{a.action}</Td><Td className="max-w-xs break-words text-xs text-ink-soft">{a.entityType}{a.metadata ? ` · ${JSON.stringify(a.metadata)}` : ''}</Td></tr>)}
      </Table>
      <Pager meta={meta} page={page} setPage={setPage} />
    </>
  );
}

/* ------------------------------------------------------------------ Reports */
type PReport = { bookingsByDay: { date: string; n: number }[]; newUsersByDay: { date: string; n: number }[]; topSalons: { id: string; name: string; bookings: number }[]; topCategories: { name: string; bookings: number }[] };
function Bars({ data, label }: { data: { date: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!data.length) return <p className="mt-3 text-ink-soft">Nothing in this period.</p>;
  return <div className="mt-4 flex h-36 items-end gap-1" role="img" aria-label={`${label}, peak ${max}`}>{data.map((d) => <div key={d.date} className="flex h-full min-w-[8px] flex-1 flex-col justify-end" title={`${fmtDate(d.date)}: ${d.n}`}><div className="rounded-t bg-burgundy" style={{ height: `${(d.n / max) * 100}%`, minHeight: 4 }} /></div>)}</div>;
}
function PlatformReports() {
  const [from, setFrom] = useState(addDays(localDate(), -29)); const [to, setTo] = useState(localDate());
  const ok = from && to && to >= from;
  const q = useQuery({ queryKey: ['admin', 'reports', from, to], enabled: !!ok, queryFn: () => get<PReport>('/admin/reports', { from, to }) });
  return (
    <>
      <PageTitle title="Platform reports" sub="Booking volume and sign-ups. Counts only: no revenue is shown because payments are recorded per salon at the counter." />
      <div className="mb-6 flex flex-wrap items-end gap-3"><Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      {!ok ? <p className="text-danger">The end date must not be before the start date.</p> : q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : !q.data ? <Skeleton className="h-64 w-full" /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><h2 className="text-2xl">Bookings per day</h2><Bars data={q.data.bookingsByDay} label="Bookings per day" /></Card>
          <Card><h2 className="text-2xl">New users per day</h2><Bars data={q.data.newUsersByDay} label="New users per day" /></Card>
          <Card><h2 className="text-2xl">Top salons</h2>{q.data.topSalons.length === 0 ? <p className="mt-3 text-ink-soft">Nothing yet.</p> : <ol className="mt-3 space-y-2">{q.data.topSalons.map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="text-ink-soft">{s.bookings}</span></li>)}</ol>}</Card>
          <Card><h2 className="text-2xl">Top categories</h2>{q.data.topCategories.length === 0 ? <p className="mt-3 text-ink-soft">Nothing yet.</p> : <ol className="mt-3 space-y-2">{q.data.topCategories.map((s) => <li key={s.name} className="flex justify-between"><span>{s.name}</span><span className="text-ink-soft">{s.bookings}</span></li>)}</ol>}</Card>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Area */
export default function AdminArea() {
  return (
    <Routes>
      <Route element={<DashboardShell items={nav} title="Admin" />}>
        <Route index element={<AdminOverview />} /><Route path="salons" element={<Salons />} /><Route path="users" element={<UsersPage />} /><Route path="bookings" element={<Bookings />} />
        <Route path="reviews" element={<ReviewsAdmin />} /><Route path="categories" element={<Categories />} /><Route path="promotions" element={<Promotions />} /><Route path="reports" element={<PlatformReports />} />
        <Route path="audit" element={<Audit />} /><Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Empty title="Page not found" action={<ButtonLink to="/admin">Back to overview</ButtonLink>} />} />
      </Route>
    </Routes>
  );
}
