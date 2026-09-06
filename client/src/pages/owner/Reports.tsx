import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Empty, ErrorState, FormError, Pagination, PageTitle, Skeleton, Stars, Textarea } from '@/components/ui';
import { download, get, getPage, patch } from '@/lib/api';
import { addDays, fmtDate, localDate, money } from '@/lib/format';
import { Input } from '@/components/ui';
import type { Summary } from '@/lib/types';
import { useSalon } from './context';

const Tile = ({ label, value, note }: { label: string; value: string | number; note?: string }) => (
  <div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-ink-soft">{label}</p><p className="mt-1 font-display text-3xl text-plum">{value}</p>{note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}</div>
);

export function Reports() {
  const { salon, base } = useSalon();
  const [from, setFrom] = useState(addDays(localDate(), -29));
  const [to, setTo] = useState(localDate());
  const valid = from && to && to >= from;
  const q = useQuery({ queryKey: ['owner', salon.id, 'report', from, to], enabled: !!valid, queryFn: () => get<Summary>(`${base}/reports/summary`, { from, to }) });
  const csv = useMutation({ mutationFn: (type: 'appointments' | 'summary') => download(`${base}/reports/export.csv`, { from, to, type }, `belle-${type}-${from}_${to}.csv`) });
  const s = q.data;
  const max = Math.max(1, ...(s?.byDay.map((d) => d.count) ?? [0]));
  return (
    <>
      <PageTitle title="Reports" sub="Bookings and performance for any period." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <Button variant="outline" disabled={!valid} loading={csv.isPending && csv.variables === 'summary'} onClick={() => csv.mutate('summary')}><Download className="h-4 w-4" />Summary CSV</Button>
        <Button variant="outline" disabled={!valid} loading={csv.isPending && csv.variables === 'appointments'} onClick={() => csv.mutate('appointments')}><Download className="h-4 w-4" />Appointments CSV</Button>
      </div>
      <FormError error={csv.error} />
      {!valid ? <p className="text-danger">The end date must not be before the start date.</p> : q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : !s ? <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Appointments" value={s.totals.total} note={`${s.totals.completed} completed · ${s.totals.pending} awaiting approval`} />
            <Tile label="Completion rate" value={`${s.rates.completionPct}%`} />
            <Tile label="Cancellation rate" value={`${s.rates.cancellationPct}%`} note={`${s.totals.cancelled} cancelled · ${s.totals.rejected} declined · ${s.totals.noShow} no-show`} />
            <Tile label="Booked value" value={money(s.bookingValueEtb)} note="Confirmed and completed bookings at list price" />
          </div>
          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-[15px]">
            <p><b className="text-plum">Booked value is not revenue.</b> {s.notes.bookingValue}</p>
            <p className="mt-2"><b className="text-plum">Payments you recorded: {money(s.recordedRevenueEtb)}.</b> {s.notes.recordedRevenue}</p>
          </div>
          <Card>
            <h2 className="text-2xl">Appointments per day</h2>
            {s.totals.total === 0 ? <p className="mt-3 text-ink-soft">No appointments in this period.</p> : (
              <div className="mt-4 overflow-x-auto"><div className="flex h-44 min-w-full items-end gap-1" role="img" aria-label={`Appointments per day, busiest day has ${max}`}>
                {s.byDay.map((d) => <div key={d.date} className="flex h-full min-w-[10px] flex-1 flex-col justify-end" title={`${fmtDate(d.date)}: ${d.count}`}><div className="rounded-t bg-burgundy" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }} /></div>)}
              </div></div>
            )}
            {s.byDay.length > 0 && <p className="mt-2 flex justify-between text-xs text-ink-soft"><span>{fmtDate(s.byDay[0].date)}</span><span>{fmtDate(s.byDay[s.byDay.length - 1].date)}</span></p>}
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="text-2xl">Popular services</h2>
              {s.popularServices.length === 0 ? <p className="mt-3 text-ink-soft">Nothing yet.</p> : (
                <table className="mt-3 w-full text-left text-[15px]"><thead className="text-sm text-ink-soft"><tr><th className="pb-2 font-medium">Service</th><th className="pb-2 text-right font-medium">Bookings</th><th className="pb-2 text-right font-medium">Booked value</th></tr></thead>
                  <tbody className="divide-y divide-line">{s.popularServices.map((p) => <tr key={p.name}><td className="py-2">{p.name}</td><td className="py-2 text-right">{p.bookings}</td><td className="py-2 text-right">{money(p.valueEtb)}</td></tr>)}</tbody></table>
              )}
            </Card>
            <Card>
              <h2 className="text-2xl">Staff utilisation</h2>
              <p className="text-sm text-ink-soft">Booked hours as a share of scheduled working hours.</p>
              {s.staffUtilization.length === 0 ? <p className="mt-3 text-ink-soft">Add staff with working hours to see this.</p> : (
                <ul className="mt-3 space-y-3">{s.staffUtilization.map((u) => (
                  <li key={u.id}><div className="flex justify-between text-[15px]"><span>{u.name}</span><span className="text-ink-soft">{u.utilizationPct}% · {u.bookedHours} of {u.availableHours} h</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-ivory-deep"><div className="h-full rounded-full bg-plum" style={{ width: `${Math.min(100, u.utilizationPct)}%` }} /></div></li>
                ))}</ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

type R = { id: string; rating: number; comment: string | null; ownerReply: string | null; isHidden: boolean; createdAt: string; reviewer: string };

function ReviewItem({ r }: { r: R }) {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.ownerReply ?? '');
  const m = useMutation({ mutationFn: (reply: string | null) => patch(`${base}/reviews/${r.id}/reply`, { reply }), onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['owner', salon.id, 'reviews'] }); } });
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3"><Stars value={r.rating} /><span className="font-semibold">{r.reviewer}</span><span className="text-sm text-ink-soft">{fmtDate(r.createdAt)}</span>{r.isHidden && <span className="text-sm font-medium text-danger">Hidden by moderators</span>}</div>
      {r.comment ? <p className="mt-2 text-[15px]">{r.comment}</p> : <p className="mt-2 text-sm text-ink-soft">No written comment.</p>}
      {r.ownerReply && !open && <div className="mt-3 rounded-xl bg-blush/40 p-3 text-[15px]"><p className="text-sm font-semibold text-plum">Your reply</p>{r.ownerReply}</div>}
      {open ? (
        <div className="mt-3 space-y-2"><Textarea label="Public reply" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /><FormError error={m.error} />
          <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" loading={m.isPending} disabled={!text.trim()} onClick={() => m.mutate(text)}>Post reply</Button></div></div>
      ) : (
        <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setOpen(true)}>{r.ownerReply ? 'Edit reply' : 'Reply'}</Button>{r.ownerReply && <Button size="sm" variant="ghost" loading={m.isPending} onClick={() => m.mutate(null)}>Remove reply</Button>}</div>
      )}
    </li>
  );
}

export function Reviews() {
  const { salon, base } = useSalon();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['owner', salon.id, 'reviews', page], queryFn: () => getPage<R>(`${base}/reviews`, { page, pageSize: 10 }) });
  const rows = q.data?.data ?? [];
  return (
    <>
      <PageTitle title="Reviews" sub="Only customers who completed a booking can review. Replies are public." />
      {q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : q.isLoading ? <Skeleton className="h-64 w-full" /> : rows.length === 0 ? <Empty title="No reviews yet" body="Reviews appear after customers complete a booking." /> : <ul className="space-y-3">{rows.map((r) => <ReviewItem key={r.id} r={r} />)}</ul>}
      {q.data?.meta && q.data.meta.totalPages > 1 && <div className="mt-6"><Pagination page={page} totalPages={q.data.meta.totalPages} onChange={setPage} /></div>}
    </>
  );
}
