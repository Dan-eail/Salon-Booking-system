import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, ErrorState, FormError, Input, PageTitle, Select, Skeleton, Switch, Textarea } from '@/components/ui';
import { del, get, patch, put, upload } from '@/lib/api';
import { dayName, inputToMinutes, minutesToInput } from '@/lib/format';
import type { Hours, OwnerProfile } from '@/lib/types';
import { cx } from '@/lib/utils';
import { useSalon } from './context';
import { fieldMsg } from './util';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const str = (v: string | null | undefined) => v ?? '';

export default function SalonProfile() {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['owner', salon.id, 'profile'], queryFn: () => get<OwnerProfile>(`${base}/profile`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['owner', salon.id] });
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-96 w-full" /></div>;
  const p = q.data;
  return (
    <>
      <PageTitle title="Salon profile" sub="What customers see on your public page." />
      <div className="space-y-6">
        <Details p={p} onSaved={refresh} />
        <Booking p={p} onSaved={refresh} />
        <HoursCard hours={p.hours} onSaved={refresh} />
        <Gallery p={p} onSaved={refresh} />
      </div>
    </>
  );
}

function useSave(onSaved: () => void, body: () => Record<string, unknown>) {
  const { base } = useSalon();
  return useMutation({ mutationFn: () => patch(`${base}/profile`, body()), onSuccess: () => { onSaved(); toast.success('Saved'); } });
}

function Details({ p, onSaved }: { p: OwnerProfile; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.name, description: p.description, city: p.city, neighborhood: p.neighborhood, address: p.address, phone: p.phone, email: str(p.email), instagram: str(p.instagram), mapUrl: str(p.mapUrl), latitude: str(p.latitude), longitude: str(p.longitude), priceLevel: String(p.priceLevel) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useSave(onSaved, () => ({ ...f, email: f.email.trim() || null, instagram: f.instagram.trim().replace(/^@/, '') || null, mapUrl: f.mapUrl.trim() || null, latitude: f.latitude === '' ? null : Number(f.latitude), longitude: f.longitude === '' ? null : Number(f.longitude), priceLevel: Number(f.priceLevel) }));
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <Card>
      <h2 className="text-2xl">Details</h2>
      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input label="Salon name" value={f.name} onChange={set('name')} error={err('name')} />
        <Textarea label="About your salon" rows={4} maxLength={2000} value={f.description} onChange={set('description')} error={err('description')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="City" value={f.city} onChange={set('city')} error={err('city')} />
          <Input label="Neighbourhood" value={f.neighborhood} onChange={set('neighborhood')} error={err('neighborhood')} />
        </div>
        <Input label="Street address" value={f.address} onChange={set('address')} error={err('address')} hint="Landmarks help: “behind Bole Medhanialem church, 2nd floor”." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone" inputMode="tel" value={f.phone} onChange={set('phone')} error={err('phone')} />
          <Input label="Email" optional type="email" value={f.email} onChange={set('email')} error={err('email')} />
          <Input label="Instagram" optional value={f.instagram} onChange={set('instagram')} error={err('instagram')} placeholder="handle" />
          <Select label="Price level" value={f.priceLevel} onChange={set('priceLevel')}><option value="1">Br: everyday</option><option value="2">Br Br: mid-range</option><option value="3">Br Br Br: premium</option><option value="4">Br Br Br Br: luxury</option></Select>
        </div>
        <Input label="Google Maps link" optional value={f.mapUrl} onChange={set('mapUrl')} error={err('mapUrl')} placeholder="https://maps.google.com/…" hint="Open your salon in Google Maps, choose Share, and paste the link." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Latitude" optional inputMode="decimal" value={f.latitude} onChange={set('latitude')} error={err('latitude')} />
          <Input label="Longitude" optional inputMode="decimal" value={f.longitude} onChange={set('longitude')} error={err('longitude')} />
        </div>
        <FormError error={m.error} />
        <div className="flex justify-end"><Button type="submit" loading={m.isPending}>Save details</Button></div>
      </form>
    </Card>
  );
}

function Booking({ p, onSaved }: { p: OwnerProfile; onSaved: () => void }) {
  const [f, setF] = useState({ bookingMode: p.bookingMode, cancellationHours: String(p.cancellationHours), cancellationPolicy: p.cancellationPolicy, bookingBufferMinutes: String(p.bookingBufferMinutes), minNoticeMinutes: String(p.minNoticeMinutes), maxAdvanceDays: String(p.maxAdvanceDays) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useSave(onSaved, () => ({ ...f, cancellationHours: Number(f.cancellationHours), bookingBufferMinutes: Number(f.bookingBufferMinutes), minNoticeMinutes: Number(f.minNoticeMinutes), maxAdvanceDays: Number(f.maxAdvanceDays), paymentMode: 'PAY_AT_SALON' }));
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <Card>
      <h2 className="text-2xl">Booking and payment</h2>
      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-plum">When a customer books</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['INSTANT', 'Confirm automatically', 'The slot is theirs straight away.'], ['APPROVAL', 'I approve each booking', 'Customers wait for your confirmation.']] as const).map(([v, t, d]) => (
              <label key={v} className={cx('cursor-pointer rounded-2xl border p-4', f.bookingMode === v ? 'border-plum bg-plum/5 ring-1 ring-plum' : 'border-line bg-white')}>
                <input type="radio" name="mode" className="sr-only" checked={f.bookingMode === v} onChange={() => setF({ ...f, bookingMode: v })} /><span className="block font-semibold">{t}</span><span className="text-sm text-ink-soft">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Minimum notice (min)" type="number" min={0} value={f.minNoticeMinutes} onChange={set('minNoticeMinutes')} error={err('minNoticeMinutes')} hint="e.g. 120 = 2 hours" />
          <Input label="Book up to (days ahead)" type="number" min={1} max={365} value={f.maxAdvanceDays} onChange={set('maxAdvanceDays')} error={err('maxAdvanceDays')} />
          <Input label="Gap between bookings (min)" type="number" min={0} value={f.bookingBufferMinutes} onChange={set('bookingBufferMinutes')} error={err('bookingBufferMinutes')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Input label="Free cancellation until (hours before)" type="number" min={0} value={f.cancellationHours} onChange={set('cancellationHours')} error={err('cancellationHours')} />
          <Textarea label="Cancellation policy" rows={2} maxLength={500} value={f.cancellationPolicy} onChange={set('cancellationPolicy')} error={err('cancellationPolicy')} />
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="flex items-center gap-2 font-semibold text-plum">Payment <Badge tone="ok">Pay at the salon</Badge></p>
          <p className="mt-1 text-sm text-ink-soft">Customers pay you directly when they visit. Online and deposit payments (Telebirr, CBE Birr, cards) are not switched on for this platform yet, because no payment provider is connected. Booked value is never shown as money collected.</p>
        </div>
        <FormError error={m.error} />
        <div className="flex justify-end"><Button type="submit" loading={m.isPending}>Save booking settings</Button></div>
      </form>
    </Card>
  );
}

function HoursCard({ hours, onSaved }: { hours: Hours[]; onSaved: () => void }) {
  const { base } = useSalon();
  const init = () => DAYS.map((d) => { const h = hours.find((x) => x.dayOfWeek === d); return { dayOfWeek: d, isClosed: h?.isClosed ?? true, openMinutes: h?.openMinutes ?? 540, closeMinutes: h?.closeMinutes ?? 1080 }; });
  const [rows, setRows] = useState(init);
  useEffect(() => setRows(init()), [hours]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({ mutationFn: () => put(`${base}/hours`, { hours: rows }), onSuccess: () => { onSaved(); toast.success('Opening hours saved'); } });
  const upd = (d: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x) => x.dayOfWeek === d ? { ...x, ...patch } : x));
  return (
    <Card>
      <h2 className="text-2xl">Opening hours</h2>
      <p className="mt-1 text-sm text-ink-soft">Shown on your page. Each staff member’s own hours decide what can be booked.</p>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.dayOfWeek} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="w-28 font-medium">{dayName(r.dayOfWeek)}</span>
            <Switch label={r.isClosed ? 'Closed' : 'Open'} checked={!r.isClosed} onCheckedChange={(v) => upd(r.dayOfWeek, { isClosed: !v })} />
            {!r.isClosed && <span className="flex items-center gap-2">
              <input aria-label={`${dayName(r.dayOfWeek)} opens`} type="time" className="h-10 rounded-lg border bg-white px-2 text-sm" value={minutesToInput(r.openMinutes)} onChange={(e) => upd(r.dayOfWeek, { openMinutes: inputToMinutes(e.target.value) })} />–
              <input aria-label={`${dayName(r.dayOfWeek)} closes`} type="time" className="h-10 rounded-lg border bg-white px-2 text-sm" value={minutesToInput(r.closeMinutes)} onChange={(e) => upd(r.dayOfWeek, { closeMinutes: inputToMinutes(e.target.value) })} />
            </span>}
          </li>
        ))}
      </ul>
      <div className="mt-3"><FormError error={m.error} /></div>
      <div className="mt-3 flex justify-end"><Button loading={m.isPending} onClick={() => m.mutate()}>Save hours</Button></div>
    </Card>
  );
}

function Gallery({ p, onSaved }: { p: OwnerProfile; onSaved: () => void }) {
  const { base } = useSalon();
  const input = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append('image', file); fd.append('alt', `${p.name} photo`); return upload(`${base}/images`, fd); },
    onSuccess: () => { onSaved(); toast.success('Photo added'); },
  });
  const rm = useMutation({ mutationFn: (id: string) => del(`${base}/images/${id}`), onSuccess: onSaved });
  const cover = useMutation({ mutationFn: (url: string | null) => patch(`${base}/profile`, { coverImage: url }), onSuccess: onSaved });
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl">Photos</h2><p className="mt-1 text-sm text-ink-soft">Real photos of your salon and your work. JPG, PNG or WebP up to 6 MB.</p></div>
        <Button variant="outline" loading={up.isPending} onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" />Add photo</Button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} />
      </div>
      <div className="mt-3 space-y-2"><FormError error={up.error ?? rm.error ?? cover.error} /></div>
      {p.images.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">No photos yet. Salons with photos get noticeably more attention.</p> : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {p.images.map((im) => (
            <li key={im.id} className="group relative overflow-hidden rounded-2xl border border-line bg-white">
              <img src={im.url} alt={im.alt} className="aspect-square w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-1 p-2">
                {p.coverImage === im.url ? <Badge tone="plum">Cover</Badge> : <Button size="sm" variant="ghost" onClick={() => cover.mutate(im.url)}>Make cover</Button>}
                <Button size="icon" variant="ghost" aria-label="Delete photo" onClick={() => rm.mutate(im.id)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
