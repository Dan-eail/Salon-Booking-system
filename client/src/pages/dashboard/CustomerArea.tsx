import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, CalendarCheck, CalendarX, Clock, Heart, MapPin, Star, User as UserIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { normalizePhone } from '@shared/phone';
import { DashboardShell } from '@/components/layout/Dashboard';
import { ArchArt } from '@/components/Art';
import { FavoriteButton } from '@/components/SalonCard';
import { SlotPicker } from '@/components/SlotPicker';
import { Button, ButtonLink, Card, Empty, ErrorState, FormError, Input, Modal, PageTitle, Pagination, Select, Skeleton, StarPicker, Stars, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { ApiError, get, getPage, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, duration, fmtDate, fmtDateTime, fmtTime, localDate, money } from '@/lib/format';
import type { Booking, BookingRow, Notice, User } from '@/lib/types';
type FavSalon = { id: string; slug: string; name: string; neighborhood: string; coverImage: string | null; avgRating: string; reviewCount: number };
import { cx } from '@/lib/utils';
import { useI18n } from '@/i18n';

const nav = [
  { to: '/dashboard', label: 'My bookings', icon: CalendarCheck, end: true },
  { to: '/dashboard/favorites', label: 'Favorites', icon: Heart },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { to: '/dashboard/profile', label: 'Profile', icon: UserIcon },
];

function BookingCard({ b }: { b: BookingRow }) {
  const past = b.status === 'COMPLETED' || b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'NO_SHOW';
  return (
    <Link to={`/dashboard/bookings/${b.id}`} className="flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-burgundy sm:p-5">
      <div className={cx('flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl py-2 text-center', past ? 'bg-ivory-deep text-ink-soft' : 'bg-plum text-ivory')}>
        <span className="text-xs">{fmtDate(b.startAt).split(' ')[0]}</span><span className="font-display text-2xl leading-none">{fmtDate(b.startAt).split(' ')[1]}</span><span className="text-xs">{fmtDate(b.startAt).split(' ')[2]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg">{b.serviceName}</h3><StatusBadge status={b.status} /></div>
        <p className="mt-0.5 text-[15px] text-ink-soft">{b.salonName} · {b.neighborhood}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft"><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{fmtTime(b.startAt)} · {duration(b.durationMinutes)}</span><span>with {b.staffName}</span></p>
      </div>
      <div className="hidden text-right sm:block"><p className="font-semibold">{money(b.priceEtb)}</p><p className="mt-1 font-mono text-xs text-ink-soft">{b.reference}</p>{b.status === 'COMPLETED' && !b.reviewed && <p className="mt-1 text-xs font-semibold text-burgundy">Leave a review</p>}</div>
    </Link>
  );
}

function Bookings() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['bookings', tab, page], queryFn: () => getPage<BookingRow>('/me/appointments', { tab, page, pageSize: 8 }) });
  return (
    <>
      <PageTitle title="My bookings" action={<ButtonLink to="/salons" variant="soft">Book another</ButtonLink>} />
      <Tabs label="Booking list" value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'History' }]} />
      <div className="mt-6 space-y-3">
        {isError ? <ErrorState error={error} retry={() => void refetch()} /> : isLoading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)
          : data?.data.length === 0 ? <Empty icon={<CalendarX className="h-8 w-8" />} title={tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments yet'} body={tab === 'upcoming' ? 'When you book, it shows up here with everything you need.' : 'Completed and cancelled bookings are kept here.'} action={<ButtonLink to="/salons">Find a salon</ButtonLink>} />
          : data?.data.map((b) => <BookingCard key={b.id} b={b} />)}
      </div>
      <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
    </>
  );
}

function BookingDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: b, isLoading, isError, error, refetch } = useQuery({ queryKey: ['booking', id], queryFn: () => get<Booking>(`/me/appointments/${id}`) });
  const [dlg, setDlg] = useState<null | 'cancel' | 'move' | 'review'>(null);
  const [date, setDate] = useState('');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const done = (msg: string) => { toast.success(msg); setDlg(null); void qc.invalidateQueries({ queryKey: ['booking', id] }); void qc.invalidateQueries({ queryKey: ['bookings'] }); void qc.invalidateQueries({ queryKey: ['range'] }); void qc.invalidateQueries({ queryKey: ['slots'] }); };
  const cancel = useMutation({ mutationFn: () => post(`/me/appointments/${id}/cancel`, { reason: reason || undefined }), onSuccess: () => done('Booking cancelled') });
  const move = useMutation({ mutationFn: () => post(`/me/appointments/${id}/reschedule`, { startAt }), onSuccess: () => done('Booking moved') });
  const review = useMutation({ mutationFn: () => post(`/me/appointments/${id}/review`, { rating, comment: comment || null }), onSuccess: () => { done('Thanks for your review'); void qc.invalidateQueries({ queryKey: ['salon'] }); } });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-3xl" />;
  if (isError || !b) return <ErrorState error={error} retry={() => void refetch()} />;
  return (
    <>
      <button onClick={() => navigate('/dashboard')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-burgundy hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />All bookings</button>
      <PageTitle title={b.serviceName} sub={`${b.salon.name} · ${b.salon.neighborhood}`} action={<StatusBadge status={b.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[130px_1fr] [&_dt]:text-sm [&_dt]:text-ink-soft [&_dd]:font-medium">
            <dt>Reference</dt><dd className="font-mono">{b.reference}</dd><dt>When</dt><dd>{dateLabel(localDate(b.startAt))}, {fmtTime(b.startAt)}</dd><dt>Duration</dt><dd>{duration(b.durationMinutes)}</dd>
            <dt>With</dt><dd>{b.staffName}</dd><dt>Where</dt><dd>{b.salon.address}, {b.salon.neighborhood}{b.salon.mapUrl && <> · <a className="text-burgundy underline" href={b.salon.mapUrl} target="_blank" rel="noopener noreferrer">Directions</a></>}</dd>
            <dt>Price</dt><dd>{money(b.priceEtb)} <span className="font-normal text-ink-soft">· pay at the salon</span></dd><dt>Salon phone</dt><dd><a className="text-burgundy underline" href={`tel:${b.salon.phone}`}>{b.salon.phone}</a></dd>
            {b.notes && <><dt>Your notes</dt><dd>{b.notes}</dd></>}{b.cancelledReason && <><dt>Reason</dt><dd>{b.cancelledReason}</dd></>}
          </dl>
          {b.review && <div className="mt-5 rounded-xl bg-ivory-deep p-4"><p className="mb-1 text-sm font-semibold text-plum">Your review</p><Stars value={b.review.rating} />{b.review.comment && <p className="mt-2 text-[15px]">{b.review.comment}</p>}</div>}
          <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
            {b.canReschedule && <Button variant="outline" onClick={() => { setDate(''); setStartAt(null); setDlg('move'); }}>Change time</Button>}
            {b.canCancel && <Button variant="dangerOutline" onClick={() => setDlg('cancel')}>Cancel booking</Button>}
            {b.canReview && <Button onClick={() => setDlg('review')}><Star className="h-4 w-4" aria-hidden />Leave a review</Button>}
            <ButtonLink to={`/salons/${b.salon.slug}`} variant="ghost">View salon</ButtonLink>
          </div>
          {(b.status === 'PENDING' || b.status === 'CONFIRMED') && !b.canCancel && <p className="mt-4 text-sm text-ink-soft">Free cancellation ended {fmtDateTime(b.cancellationDeadline)}. To change this booking, call the salon.</p>}
          {b.status === 'PENDING' && <p className="mt-4 text-sm text-ink-soft">Waiting for the salon to confirm. You can still withdraw this request.</p>}
        </Card>
        <Card><h2 className="mb-3 text-xl">Timeline</h2>
          <ol className="relative space-y-4 border-l border-line pl-5">{b.history.map((h, i) => (
            <li key={i}><span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-burgundy" aria-hidden /><p className="text-sm font-semibold text-plum">{h.toStatus === 'PENDING' ? 'Requested' : h.toStatus.charAt(0) + h.toStatus.slice(1).toLowerCase().replace('_', ' ')}</p><p className="text-xs text-ink-soft">{fmtDateTime(h.createdAt)}</p>{h.note && <p className="mt-0.5 text-sm">{h.note}</p>}</li>))}</ol>
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft">{b.salon.cancellationPolicy}</p></Card>
      </div>

      <Modal open={dlg === 'cancel'} onOpenChange={(o) => setDlg(o ? 'cancel' : null)} title="Cancel this booking?" description={`${b.serviceName} on ${fmtDateTime(b.startAt)} will be released for other customers.`}>
        <Textarea label="Reason" optional value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Let the salon know why (optional)" />
        <div className="mt-4"><FormError error={cancel.error} /></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => setDlg(null)}>Keep booking</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel booking</Button></div>
      </Modal>
      <Modal open={dlg === 'move'} onOpenChange={(o) => setDlg(o ? 'move' : null)} title="Change time" description="Pick another open time for the same service." wide>
        <SlotPicker slug={b.salon.slug} serviceId={b.serviceId} date={date} onDate={(d) => { setDate(d); setStartAt(null); }} startAt={startAt} onPick={(sl) => setStartAt(sl.startAt)} />
        <div className="mt-4"><FormError error={move.error} /></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => setDlg(null)}>Keep current time</Button><Button disabled={!startAt} loading={move.isPending} onClick={() => move.mutate()}>Move booking</Button></div>
      </Modal>
      <Modal open={dlg === 'review'} onOpenChange={(o) => setDlg(o ? 'review' : null)} title="How was your visit?" description={`${b.serviceName} at ${b.salon.name}`}>
        <StarPicker value={rating} onChange={setRating} />
        <div className="mt-4"><Textarea label="Comments" optional value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="What did you like? What could be better?" /></div>
        <div className="mt-4"><FormError error={review.error} /></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => setDlg(null)}>Not now</Button><Button disabled={!rating} loading={review.isPending} onClick={() => review.mutate()}>Submit review</Button></div>
      </Modal>
    </>
  );
}

function Favorites() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['favorites'], queryFn: () => get<FavSalon[]>('/me/favorites') });
  return (
    <>
      <PageTitle title="Favorite salons" />
      {isError ? <ErrorState error={error} retry={() => void refetch()} /> : isLoading ? <Skeleton className="h-64 w-full" /> : !data?.length ? <Empty icon={<Heart className="h-8 w-8" />} title="No favorites yet" body="Tap the heart on any salon to keep it here." action={<ButtonLink to="/salons">Browse salons</ButtonLink>} />
        : <ul className="grid gap-4 sm:grid-cols-2">{data.map((s) => (
            <li key={s.id} className="relative flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-soft">
              <Link to={`/salons/${s.slug}`} className="flex min-w-0 flex-1 gap-4">
                <span className="h-20 w-16 shrink-0 overflow-hidden rounded-arch bg-plum">{s.coverImage ? <img src={s.coverImage} alt="" className="h-full w-full object-cover" /> : <ArchArt kind="hair" seed={s.name.length} className="h-full w-full" />}</span>
                <span className="min-w-0"><span className="block truncate font-display text-lg text-plum">{s.name}</span><span className="mt-1 flex items-center gap-1 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5" aria-hidden />{s.neighborhood}</span><span className="mt-1 block text-sm">{s.reviewCount > 0 ? `★ ${Number(s.avgRating).toFixed(1)} (${s.reviewCount})` : 'New'}</span></span>
              </Link>
              <FavoriteButton salonId={s.id} active className="shrink-0 border border-line" />
            </li>))}</ul>}
    </>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({ queryKey: ['notifications', 'list'], initialPageParam: 1, queryFn: ({ pageParam }) => getPage<Notice>('/me/notifications', { page: pageParam, pageSize: 15 }), getNextPageParam: (l) => (l.meta && l.meta.page < l.meta.totalPages ? l.meta.page + 1 : undefined) });
  const readAll = useMutation({ mutationFn: () => post('/me/notifications/read-all'), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['notifications'] }); } });
  const read = useMutation({ mutationFn: (id: string) => post(`/me/notifications/${id}/read`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['notifications'] }); } });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = (q.data?.pages[0]?.meta?.unreadCount as number) ?? 0;
  return (
    <>
      <PageTitle title="Notifications" sub="In-app alerts about your bookings." action={unread > 0 ? <Button variant="outline" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>Mark all as read</Button> : undefined} />
      {q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : q.isLoading ? <Skeleton className="h-48 w-full" /> : items.length === 0 ? <Empty icon={<Bell className="h-8 w-8" />} title="You’re all caught up" body="Booking confirmations, changes and reminders will appear here." />
        : <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">{items.map((n) => (
            <li key={n.id} className={cx('flex gap-3 p-4', !n.readAt && 'bg-blush-soft/70')}>
              <span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-burgundy')} aria-label={n.readAt ? undefined : 'Unread'} />
              <div className="min-w-0 flex-1"><p className="font-semibold text-plum">{n.title}</p><p className="mt-0.5 text-[15px]">{n.body}</p><p className="mt-1 text-xs text-ink-soft">{fmtDateTime(n.createdAt)}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1">{n.link && <Link to={n.link} onClick={() => !n.readAt && read.mutate(n.id)} className="text-sm font-semibold text-burgundy hover:underline">View</Link>}{!n.readAt && <button className="text-xs text-ink-soft underline" onClick={() => read.mutate(n.id)}>Mark read</button>}</div>
            </li>))}</ul>}
      {q.hasNextPage && <div className="mt-5 text-center"><Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
    </>
  );
}

const profileSchema = z.object({ fullName: z.string().trim().min(2, 'Enter your name'), phone: z.string().trim().refine((v) => !!normalizePhone(v), 'Enter a valid phone number'), city: z.string().trim().max(60), locale: z.enum(['en', 'am']) });
const pwSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: z.string().min(8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number') });

export function ProfileForms() {
  const { user, setUser, logout } = useAuth();
  const { setLocale } = useI18n();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: () => get<{ user: User; city: string | null }>('/auth/me') });
  const f = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), values: { fullName: user?.fullName ?? '', phone: user?.phone ?? '', city: me.data?.city ?? '', locale: user?.locale ?? 'en' } });
  const p = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof profileSchema>) => patch<{ user: User }>('/auth/me', v),
    onSuccess: (r, v) => { setUser(r.user); setLocale(v.locale); toast.success('Profile saved'); },
    onError: (e) => { if (e instanceof ApiError && e.code === 'PHONE_TAKEN') f.setError('phone', { message: e.message }); },
  });
  const pw = useMutation({ mutationFn: (v: z.infer<typeof pwSchema>) => post('/auth/change-password', v), onSuccess: async () => { toast.success('Password changed. Please sign in again.'); await logout(); navigate('/login'); }, onError: (e) => { if (e instanceof ApiError && e.status === 400) p.setError('currentPassword', { message: e.message }); } });
  return (
    <>
      <PageTitle title="Profile" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><h2 className="mb-4 text-xl">Contact details</h2>
          <form onSubmit={f.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
            <Input label="Full name" error={f.formState.errors.fullName?.message} {...f.register('fullName')} />
            <Input label="Email" value={user?.email ?? ''} disabled readOnly hint="Email can’t be changed here." />
            <Input label="Phone" type="tel" error={f.formState.errors.phone?.message} {...f.register('phone')} />
            <Input label="City" optional {...f.register('city')} />
            <Select label="Language" {...f.register('locale')}><option value="en">English</option><option value="am">አማርኛ (Amharic)</option></Select>
            <FormError error={save.error instanceof ApiError && save.error.code === 'PHONE_TAKEN' ? null : save.error} /><Button type="submit" loading={save.isPending}>Save changes</Button>
          </form></Card>
        <Card><h2 className="mb-4 text-xl">Change password</h2>
          <form onSubmit={p.handleSubmit((v) => pw.mutate(v))} noValidate className="space-y-4">
            <Input label="Current password" type="password" autoComplete="current-password" error={p.formState.errors.currentPassword?.message} {...p.register('currentPassword')} />
            <Input label="New password" type="password" autoComplete="new-password" hint="You’ll be signed out on all devices." error={p.formState.errors.newPassword?.message} {...p.register('newPassword')} />
            <FormError error={pw.error instanceof ApiError && pw.error.status === 400 ? null : pw.error} /><Button type="submit" variant="plum" loading={pw.isPending}>Change password</Button>
          </form></Card>
      </div>
    </>
  );
}

export default function CustomerArea() {
  return (
    <Routes>
      <Route element={<DashboardShell items={nav} title="My account" />}>
        <Route index element={<Bookings />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<ProfileForms />} />
        <Route path="*" element={<Empty title="Page not found" action={<ButtonLink to="/dashboard">Back to my bookings</ButtonLink>} />} />
      </Route>
    </Routes>
  );
}
