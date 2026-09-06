import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { SlotPicker } from '@/components/SlotPicker';
import { Button, Empty, ErrorState, FormError, Input, Modal, PageTitle, Pagination, Select, Skeleton, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { get, getPage, patch, post } from '@/lib/api';
import { addDays, dateLabel, duration, fmtDateTime, fmtTime, localDate, money } from '@/lib/format';
import type { ApptDetail, ApptRow, AppointmentStatus, OwnerService, OwnerStaff } from '@/lib/types';
import { cx } from '@/lib/utils';
import { useSalon } from './context';
import { fieldMsg, monthStart, weekStart } from './util';

type View = 'list' | 'day' | 'week' | 'month';
const STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
const statusLabel: Record<AppointmentStatus, string> = { PENDING: 'Awaiting approval', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Declined', NO_SHOW: 'No-show' };

function useInvalidate() {
  const qc = useQueryClient();
  const { salon } = useSalon();
  return () => qc.invalidateQueries({ queryKey: ['owner', salon.id] });
}

/* ------------------------------------------------------------------ Detail */
function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { salon, base } = useSalon();
  const inval = useInvalidate();
  const q = useQuery({ queryKey: ['owner', salon.id, 'appt', id], queryFn: () => get<ApptDetail>(`${base}/appointments/${id}`) });
  const [notes, setNotes] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { status: 'CANCELLED' | 'REJECTED' | 'NO_SHOW'; label: string; body: string }>(null);
  const [reason, setReason] = useState('');
  const [resched, setResched] = useState(false);
  const [amount, setAmount] = useState('');
  const a = q.data;

  const refresh = () => { void q.refetch(); void inval(); };
  const status = useMutation({
    mutationFn: (v: { status: string; note?: string }) => patch(`${base}/appointments/${id}/status`, v),
    onSuccess: () => { setConfirm(null); setReason(''); refresh(); },
  });
  const saveNotes = useMutation({ mutationFn: () => patch(`${base}/appointments/${id}/notes`, { ownerNotes: (notes ?? '').trim() || null }), onSuccess: refresh });
  const pay = useMutation({ mutationFn: () => post(`${base}/appointments/${id}/payments`, { amountEtb: amount }), onSuccess: () => { setAmount(''); refresh(); } });

  const body = !a ? (q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : <Skeleton className="h-64 w-full" />) : (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3"><StatusBadge status={a.status} /><span className="text-sm text-ink-soft">Ref {a.reference}</span></div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-[15px]">
        <dt className="text-ink-soft">Service</dt><dd className="font-medium">{a.serviceName} · {duration(a.durationMinutes)}</dd>
        <dt className="text-ink-soft">When</dt><dd className="font-medium">{fmtDateTime(a.startAt)} – {fmtTime(a.endAt)}</dd>
        <dt className="text-ink-soft">With</dt><dd>{a.staffName}</dd>
        <dt className="text-ink-soft">Customer</dt><dd>{a.guestName} · <a className="text-burgundy underline" href={`tel:${a.guestPhone}`}>{a.guestPhone}</a>{a.customerEmail && <span className="block text-ink-soft">{a.customerEmail}</span>}</dd>
        {a.notes && <><dt className="text-ink-soft">Customer note</dt><dd>{a.notes}</dd></>}
        <dt className="text-ink-soft">Price</dt><dd>{money(a.priceEtb)} <span className="text-ink-soft">· {a.paymentStatus === 'PAID' ? 'paid' : a.paymentStatus === 'PARTIAL' ? 'partly paid' : 'to be paid at the salon'}</span></dd>
        {a.cancelledReason && <><dt className="text-ink-soft">Reason</dt><dd>{a.cancelledReason}</dd></>}
      </dl>

      <div className="flex flex-wrap gap-2">
        {a.status === 'PENDING' && <><Button size="sm" loading={status.isPending} onClick={() => status.mutate({ status: 'CONFIRMED' })}>Confirm</Button><Button size="sm" variant="dangerOutline" onClick={() => setConfirm({ status: 'REJECTED', label: 'Decline booking', body: 'The customer is told the booking was declined. You can add a reason.' })}>Decline</Button></>}
        {a.status === 'CONFIRMED' && <><Button size="sm" loading={status.isPending} onClick={() => status.mutate({ status: 'COMPLETED' })}>Mark completed</Button><Button size="sm" variant="outline" onClick={() => setConfirm({ status: 'NO_SHOW', label: 'Mark as no-show', body: 'Use this when the customer did not arrive.' })}>No-show</Button></>}
        {(a.status === 'PENDING' || a.status === 'CONFIRMED') && <>
          <Button size="sm" variant="outline" onClick={() => setResched(true)}>Reschedule</Button>
          <Button size="sm" variant="dangerOutline" onClick={() => setConfirm({ status: 'CANCELLED', label: 'Cancel booking', body: 'The customer is told you cancelled. The time slot is released.' })}>Cancel</Button>
        </>}
      </div>
      {status.isError && !confirm && <FormError error={status.error} />}

      {a.status === 'COMPLETED' || a.status === 'CONFIRMED' ? (
        <section className="rounded-2xl border border-line bg-white p-4">
          <h3 className="font-semibold text-plum">Cash payment</h3>
          <p className="mt-1 text-sm text-ink-soft">Customers pay at the salon. Record what you actually received. {a.payments.length > 0 && `Outstanding: ${money(a.outstandingEtb)}.`}</p>
          {a.payments.length > 0 && <ul className="mt-2 text-sm">{a.payments.map((p) => <li key={p.id}>{money(p.amountEtb)} · {p.provider.toLowerCase()} · {p.paidAt ? fmtDateTime(p.paidAt) : p.status}</li>)}</ul>}
          {Number(a.outstandingEtb) > 0 && (
            <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); pay.mutate(); }}>
              <Input label="Amount received (Br)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldMsg(pay.error, 'amountEtb')} wrapperClass="flex-1" />
              <Button size="md" type="submit" loading={pay.isPending} disabled={!amount}>Record</Button>
            </form>
          )}
          {pay.isError && !fieldMsg(pay.error, 'amountEtb') && <div className="mt-2"><FormError error={pay.error} /></div>}
        </section>
      ) : null}

      <section>
        <Textarea label="Private notes" hint="Only your team sees these." rows={3} value={notes ?? a.ownerNotes ?? ''} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <div className="mt-2 flex justify-end"><Button size="sm" variant="outline" loading={saveNotes.isPending} disabled={notes === null || notes === (a.ownerNotes ?? '')} onClick={() => saveNotes.mutate()}>Save notes</Button></div>
        {saveNotes.isError && <FormError error={saveNotes.error} />}
      </section>

      <section>
        <h3 className="font-semibold text-plum">History</h3>
        <ol className="mt-2 space-y-1.5 border-l border-line pl-4 text-sm">
          {a.history.map((h, i) => <li key={i}><span className="font-medium">{h.fromStatus ? `${statusLabel[h.fromStatus as AppointmentStatus] ?? h.fromStatus} → ` : ''}{statusLabel[h.toStatus as AppointmentStatus] ?? h.toStatus}</span> <span className="text-ink-soft">· {fmtDateTime(h.createdAt)}{h.changedBy ? ` · ${h.changedBy}` : ''}{h.note ? ` · ${h.note}` : ''}</span></li>)}
        </ol>
      </section>

      <Modal open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={confirm?.label ?? ''}>
        <p className="text-[15px] text-ink-soft">{confirm?.body}</p>
        <div className="mt-4"><Textarea label="Reason" optional rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>
        <div className="mt-4"><FormError error={confirm ? status.error : null} /></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => setConfirm(null)}>Back</Button><Button variant="danger" loading={status.isPending} onClick={() => confirm && status.mutate({ status: confirm.status, note: reason.trim() || undefined })}>{confirm?.label}</Button></div>
      </Modal>
      {resched && <Reschedule appt={a} onClose={() => setResched(false)} onDone={() => { setResched(false); refresh(); }} />}
    </div>
  );
  return <Modal open onOpenChange={(o) => !o && onClose()} title={a ? a.guestName : 'Appointment'} wide>{body}</Modal>;
}

function Reschedule({ appt, onClose, onDone }: { appt: ApptDetail; onClose: () => void; onDone: () => void }) {
  const { salon, base } = useSalon();
  const [date, setDate] = useState(localDate(appt.startAt));
  const [startAt, setStartAt] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const services = useQuery({ queryKey: ['owner', salon.id, 'services'], queryFn: () => get<OwnerService[]>(`${base}/services`) });
  const serviceId = services.data?.find((s) => s.name === appt.serviceName)?.id ?? '';
  const m = useMutation({ mutationFn: () => post(`${base}/appointments/${appt.id}/reschedule`, { startAt, staffId }), onSuccess: onDone });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Reschedule" description={`${appt.guestName} · ${appt.serviceName}`} wide>
      {salon.status !== 'ACTIVE' ? <p className="text-sm text-ink-soft">Rescheduling uses live availability, which is available once your salon is approved.</p> : !serviceId ? <Skeleton className="h-40 w-full" /> :
        <SlotPicker slug={salon.slug} serviceId={serviceId} date={date} onDate={setDate} startAt={startAt} onPick={(s) => { setStartAt(s.startAt); setStaffId(s.staffIds.includes(appt.staffId) ? appt.staffId : s.staffIds[0] ?? null); }} compact />}
      <div className="mt-4"><FormError error={m.error} /></div>
      <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Close</Button><Button loading={m.isPending} disabled={!startAt} onClick={() => m.mutate()}>Move appointment</Button></div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ New manual booking */
function NewAppointment({ onClose }: { onClose: () => void }) {
  const { salon, base } = useSalon();
  const inval = useInvalidate();
  const services = useQuery({ queryKey: ['owner', salon.id, 'services'], queryFn: () => get<OwnerService[]>(`${base}/services`) });
  const staff = useQuery({ queryKey: ['owner', salon.id, 'staff'], queryFn: () => get<OwnerStaff[]>(`${base}/staff`) });
  const [f, setF] = useState({ serviceId: '', staffId: '', guestName: '', guestPhone: '', guestEmail: '', notes: '' });
  const [date, setDate] = useState(localDate());
  const [startAt, setStartAt] = useState<string | null>(null);
  const [pickedStaff, setPickedStaff] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => post(`${base}/appointments`, { serviceId: f.serviceId, staffId: f.staffId || pickedStaff, startAt, guestName: f.guestName, guestPhone: f.guestPhone, guestEmail: f.guestEmail || null, notes: f.notes || null }),
    onSuccess: () => { void inval(); onClose(); },
  });
  const active = (services.data ?? []).filter((s) => s.isActive);
  const eligible = (staff.data ?? []).filter((s) => s.isActive && (!f.serviceId || s.serviceIds.includes(f.serviceId)));
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="New appointment" description="For walk-ins and phone bookings. It goes straight into your diary as confirmed." wide>
      {salon.status !== 'ACTIVE' ? <p className="text-[15px] text-ink-soft">Manual bookings use live availability. They open up once your salon has been approved and has an active service and staff.</p> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Service" value={f.serviceId} onChange={(e) => { set('serviceId')(e); setStartAt(null); }} error={fieldMsg(m.error, 'serviceId')}><option value="">Choose…</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name} · {duration(s.durationMinutes)} · {money(s.priceEtb)}</option>)}</Select>
            <Select label="Staff member" optional value={f.staffId} onChange={(e) => { set('staffId')(e); setStartAt(null); }}><option value="">Anyone available</option>{eligible.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</Select>
          </div>
          {f.serviceId && <SlotPicker slug={salon.slug} serviceId={f.serviceId} staffId={f.staffId || null} date={date} onDate={setDate} startAt={startAt} onPick={(s) => { setStartAt(s.startAt); setPickedStaff(s.staffIds[0] ?? null); }} compact />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Customer name" value={f.guestName} onChange={set('guestName')} error={fieldMsg(m.error, 'guestName')} autoComplete="off" />
            <Input label="Phone" value={f.guestPhone} onChange={set('guestPhone')} placeholder="09… or +251…" inputMode="tel" error={fieldMsg(m.error, 'guestPhone')} autoComplete="off" />
          </div>
          <Input label="Email" optional type="email" value={f.guestEmail} onChange={set('guestEmail')} error={fieldMsg(m.error, 'guestEmail')} />
          <Textarea label="Note" optional rows={2} value={f.notes} onChange={set('notes')} />
          <FormError error={m.error} />
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={m.isPending} disabled={!f.serviceId || !startAt || !f.guestName || !f.guestPhone}>Add to diary</Button></div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Calendar views */
function useRange(from: string, to: string, staffId: string) {
  const { salon, base } = useSalon();
  return useQuery({
    queryKey: ['owner', salon.id, 'appts', 'range', from, to, staffId],
    queryFn: () => getPage<ApptRow>(`${base}/appointments`, { from, to, staffId: staffId || undefined, pageSize: 200, page: 1 }),
  });
}
const dim = (a: ApptRow) => a.status === 'CANCELLED' || a.status === 'REJECTED' || a.status === 'NO_SHOW';
const chip = (a: ApptRow) => cx('block w-full rounded-lg border px-2 py-1 text-left text-xs leading-tight transition-colors hover:border-burgundy', dim(a) ? 'border-line bg-ivory-deep text-ink-soft line-through' : a.status === 'PENDING' ? 'border-warn/50 bg-warn/10' : 'border-burgundy/25 bg-blush/50');

function Calendar({ view, cursor, setCursor, staffId, open }: { view: 'day' | 'week' | 'month'; cursor: string; setCursor: (d: string) => void; staffId: string; open: (id: string) => void }) {
  const from = view === 'day' ? cursor : view === 'week' ? weekStart(cursor) : weekStart(monthStart(cursor));
  const to = view === 'day' ? cursor : view === 'week' ? addDays(from, 6) : addDays(weekStart(monthStart(cursor)), 41);
  const q = useRange(from, to, staffId);
  const step = (dir: number) => setCursor(view === 'day' ? addDays(cursor, dir) : view === 'week' ? addDays(cursor, 7 * dir) : addDays(monthStart(cursor), dir > 0 ? 32 : -1));
  const rows = q.data?.data ?? [];
  const on = (d: string) => rows.filter((a) => localDate(a.startAt) === d);
  const days = Array.from({ length: view === 'day' ? 1 : view === 'week' ? 7 : 42 }, (_, i) => addDays(from, i));
  const title = view === 'month' ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cursor}T12:00:00Z`)) : view === 'day' ? dateLabel(cursor) : `${dateLabel(from)} – ${dateLabel(to)}`;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft className="h-5 w-5" /></Button>
        <Button variant="outline" size="icon" aria-label="Next" onClick={() => step(1)}><ChevronRight className="h-5 w-5" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setCursor(localDate())}>Today</Button>
        <p className="ml-1 font-display text-xl text-plum">{title}</p>
      </div>
      {q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : q.isLoading ? <Skeleton className="h-96 w-full" /> : view === 'day' ? (
        on(cursor).length === 0 ? <Empty title="Nothing booked this day" /> :
          <ul className="space-y-2">{on(cursor).map((a) => <li key={a.id}><button onClick={() => open(a.id)} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left hover:border-burgundy"><span className="w-20 shrink-0 font-semibold text-plum">{fmtTime(a.startAt)}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.serviceName} · {a.guestName}</span><span className="block text-sm text-ink-soft">{a.staffName} · {duration(a.durationMinutes)}</span></span><StatusBadge status={a.status} /></button></li>)}</ul>
      ) : (
        <div className="overflow-x-auto">
          <div className={cx('grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line')}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-ivory-deep px-2 py-1.5 text-center text-xs font-semibold text-ink-soft">{d}</div>)}
            {days.map((d) => {
              const list = on(d); const other = view === 'month' && d.slice(0, 7) !== cursor.slice(0, 7);
              return (
                <div key={d} className={cx('min-h-28 bg-white p-1.5', other && 'bg-ivory/60 opacity-60')}>
                  <p className={cx('mb-1 text-xs font-semibold', d === localDate() ? 'text-burgundy' : 'text-ink-soft')}>{Number(d.slice(8))}</p>
                  <div className="space-y-1">{list.slice(0, view === 'month' ? 3 : 12).map((a) => <button key={a.id} onClick={() => open(a.id)} className={chip(a)}><b>{fmtTime(a.startAt)}</b> {a.guestName}</button>)}
                    {view === 'month' && list.length > 3 && <button className="text-xs font-semibold text-burgundy" onClick={() => setCursor(d)}>+{list.length - 3} more</button>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Page */
export default function Appointments() {
  const { salon, base, isOwner } = useSalon();
  const [view, setView] = useState<View>('list');
  const [cursor, setCursor] = useState(localDate());
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ status: '', staffId: '', from: '', to: '', q: '' });
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const staff = useQuery({ queryKey: ['owner', salon.id, 'staff'], queryFn: () => get<OwnerStaff[]>(`${base}/staff`) });
  const list = useQuery({
    queryKey: ['owner', salon.id, 'appts', 'list', page, f], enabled: view === 'list',
    queryFn: () => getPage<ApptRow>(`${base}/appointments`, { page, pageSize: 15, status: f.status || undefined, staffId: f.staffId || undefined, from: f.from || undefined, to: f.to || undefined, q: f.q || undefined }),
  });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };
  const rows = list.data?.data ?? []; const meta = list.data?.meta;
  return (
    <>
      <PageTitle title="Appointments" sub={isOwner ? 'Everything booked at your salon.' : 'Your own diary.'} action={<Button onClick={() => setAdding(true)}><CalendarPlus className="h-4 w-4" />New appointment</Button>} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs label="View" value={view} onChange={setView} items={[{ value: 'list', label: 'List' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        {isOwner && (staff.data?.length ?? 0) > 1 && <Select label="Staff" className="w-48" value={f.staffId} onChange={upd('staffId')}><option value="">All staff</option>{staff.data!.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</Select>}
      </div>

      {view !== 'list' ? <Calendar view={view} cursor={cursor} setCursor={setCursor} staffId={f.staffId} open={setOpenId} /> : (
        <>
          <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_150px_150px]" onSubmit={(e) => { e.preventDefault(); setF((x) => ({ ...x, q: term })); setPage(1); }}>
            <div className="relative"><Input label="Search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name, phone or reference" className="pl-10" /><Search className="pointer-events-none absolute bottom-3.5 left-3.5 h-4 w-4 text-ink-soft" /></div>
            <Select label="Status" value={f.status} onChange={upd('status')}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}</Select>
            <Input label="From" type="date" value={f.from} onChange={upd('from')} />
            <Input label="To" type="date" value={f.to} onChange={upd('to')} />
          </form>
          {list.isError ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : list.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : rows.length === 0 ? <Empty title="No appointments match" body="Try a different filter, or add an appointment for a walk-in." /> : (
            <ul className="space-y-3">
              {rows.map((a) => (
                <li key={a.id}>
                  <button onClick={() => setOpenId(a.id)} className="grid w-full gap-2 rounded-2xl border border-line bg-white p-4 text-left transition-colors hover:border-burgundy sm:grid-cols-[170px_1fr_auto] sm:items-center">
                    <span className="font-semibold text-plum">{fmtDateTime(a.startAt)}</span>
                    <span className="min-w-0"><span className="block truncate font-medium">{a.serviceName} · {a.guestName}</span><span className="block truncate text-sm text-ink-soft">{a.staffName} · {money(a.priceEtb)}{a.createdByOwner ? ' · added by salon' : ''}</span></span>
                    <StatusBadge status={a.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {meta && meta.totalPages > 1 && <div className="mt-6"><Pagination page={page} totalPages={meta.totalPages} onChange={setPage} /></div>}
        </>
      )}
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
      {adding && <NewAppointment onClose={() => setAdding(false)} />}
    </>
  );
}
