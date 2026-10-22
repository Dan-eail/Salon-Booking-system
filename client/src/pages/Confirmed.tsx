import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CheckCircle2, Hourglass, MapPin } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Tilet } from '@/components/Art';
import { Button, ButtonLink, ErrorState, Skeleton } from '@/components/ui';
import { get } from '@/lib/api';
import { dateLabel, duration, fmtTime, localDate, money } from '@/lib/format';
import type { Booking } from '@/lib/types';

const ics = (b: Booking) => {
  const f = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Belle Ethiopia//EN', 'BEGIN:VEVENT', `UID:${b.reference}@belle`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(b.startAt)}`, `DTEND:${f(b.endAt)}`,
    `SUMMARY:${esc(`${b.serviceName} at ${b.salon.name}`)}`, `LOCATION:${esc(`${b.salon.address}, ${b.salon.neighborhood}`)}`, `DESCRIPTION:${esc(`Booking reference ${b.reference}`)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
};

export default function Confirmed() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const txRef = params.get('tx_ref');

  // If redirected with a transaction reference, verify payment
  useEffect(() => {
    if (txRef && id) {
      void get<Booking>(`/me/appointments/${id}/pay/verify?tx_ref=${encodeURIComponent(txRef)}`)
        .then(() => {
          void qc.invalidateQueries({ queryKey: ['booking', id] });
          void qc.invalidateQueries({ queryKey: ['bookings'] });
        })
        .catch(() => {});
    }
  }, [id, txRef, qc]);

  const { data: b, isLoading, isError, error, refetch } = useQuery({ queryKey: ['booking', id], queryFn: () => get<Booking>(`/me/appointments/${id}`) });
  if (isLoading) return <div className="container-page max-w-xl py-12"><Skeleton className="h-96 w-full rounded-3xl" /></div>;
  if (isError || !b) return <div className="container-page py-16"><ErrorState error={error} retry={() => void refetch()} /></div>;

  const pending = b.status === 'PENDING';
  const depositPaid = b.payments?.reduce((sum, p) => sum + Number(p.amountEtb), 0) ?? 0;
  const totalPrice = Number(b.priceEtb);
  const remainingAtSalon = Math.max(0, totalPrice - depositPaid);

  const download = () => {
    const url = URL.createObjectURL(new Blob([ics(b)], { type: 'text/calendar' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${b.reference}.ics` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="container-page max-w-xl py-12">
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-lift">
        <div className="bg-plum px-8 pb-8 pt-10 text-center text-ivory">
          {pending ? <Hourglass className="mx-auto h-10 w-10 text-gold" aria-hidden /> : <CheckCircle2 className="mx-auto h-10 w-10 text-gold" aria-hidden />}
          <h1 className="mt-4 text-3xl text-ivory sm:text-4xl">{pending ? 'Request sent' : 'You’re booked'}</h1>
          <p className="mt-2 text-ivory/80">{pending ? `${b.salon.name} will confirm your booking. We’ll notify you.` : `See you at ${b.salon.name}.`}</p>
          <p className="mt-6 text-sm text-ivory/70">Booking reference</p><p className="mt-1 font-display text-3xl tracking-widest text-gold" aria-label={`Reference ${b.reference.split('').join(' ')}`}>{b.reference}</p>
        </div>
        <Tilet thin />
        <div className="space-y-5 p-8">
          {/* Payment Status Banner */}
          {depositPaid > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-950">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  50% Online Deposit Received
                </span>
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-2xs">
                  Paid {money(depositPaid)}
                </span>
              </div>
              <p className="text-xs text-emerald-900/80">
                Paid securely online via <strong>Telebirr / Chapa</strong>. Remaining balance of <strong>{money(remainingAtSalon)}</strong> will be paid directly at the salon after your service.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">50% Deposit Pending</span>
              <span className="text-xs font-bold text-amber-800">{money(totalPrice * 0.5)} due</span>
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[130px_1fr] [&_dt]:text-sm [&_dt]:text-ink-soft [&_dd]:font-medium">
            <dt>Service</dt><dd>{b.serviceName} · {duration(b.durationMinutes)}</dd>
            <dt>When</dt><dd>{dateLabel(localDate(b.startAt))}, {fmtTime(b.startAt)}</dd>
            <dt>With</dt><dd>{b.staffName}</dd>
            <dt>Where</dt><dd>{b.salon.address}, {b.salon.neighborhood}</dd>
            <dt>Total service</dt><dd className="font-semibold text-plum">{money(b.priceEtb)}</dd>
            <dt>Paid deposit</dt><dd className="font-semibold text-emerald-700">{money(depositPaid)} (50%)</dd>
            <dt>Due at salon</dt><dd className="font-semibold text-plum">{money(remainingAtSalon)}</dd>
          </dl>

          <p className="rounded-xl bg-ivory-deep p-4 text-sm">{b.salon.cancellationPolicy}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={download}><CalendarPlus className="h-4 w-4" aria-hidden />Add to calendar</Button>
            {b.salon.mapUrl && <a className="inline-flex h-11 items-center gap-2 rounded-full border border-plum/30 px-6 text-[15px] font-semibold text-plum hover:border-plum" href={b.salon.mapUrl} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4" aria-hidden />Directions</a>}
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5"><ButtonLink to={`/dashboard/bookings/${b.id}`} variant="soft">Manage booking</ButtonLink><Link to="/salons" className="self-center text-sm font-semibold text-burgundy hover:underline">Browse more salons</Link></div>
        </div>
      </div>
    </div>
  );
}
