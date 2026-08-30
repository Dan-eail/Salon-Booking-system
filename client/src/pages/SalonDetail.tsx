import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Clock, ExternalLink, Info, Instagram, MapPin, Phone, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArchArt } from '@/components/Art';
import { FavoriteButton } from '@/components/SalonCard';
import { SlotPicker } from '@/components/SlotPicker';
import { Badge, ButtonLink, Button, ErrorState, Select, Skeleton, Stars } from '@/components/ui';
import { get } from '@/lib/api';
import { dayName, duration, fmtDate, localDate, minutesToLabel, money } from '@/lib/format';
import type { SalonDetail as Salon } from '@/lib/types';
import { cx } from '@/lib/utils';
import { useI18n } from '@/i18n';

function Gallery({ salon }: { salon: Salon }) {
  const imgs = [...(salon.coverImage ? [{ id: 'cover', url: salon.coverImage, alt: salon.name }] : []), ...salon.images.filter((i) => i.url !== salon.coverImage)];
  const [i, setI] = useState(0);
  if (!imgs.length) {
    return <div className="grid h-64 grid-cols-3 gap-3 sm:h-80">{['hair', 'nails', 'hair'].map((k, n) => <ArchArt key={n} kind={k} seed={n + salon.name.length} className={cx('h-full w-full overflow-hidden rounded-arch', n === 1 && 'mt-6')} />)}</div>;
  }
  return (
    <div>
      <div className="aspect-[16/10] overflow-hidden rounded-3xl bg-plum sm:aspect-[2/1]"><img src={imgs[i].url} alt={imgs[i].alt || `${salon.name} photo ${i + 1}`} className="h-full w-full object-cover" /></div>
      {imgs.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{imgs.map((m, n) => (
        <button key={m.id} onClick={() => setI(n)} aria-label={`Show photo ${n + 1}`} aria-current={n === i} className={cx('h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2', n === i ? 'border-burgundy' : 'border-transparent opacity-70 hover:opacity-100')}><img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" /></button>))}</div>}
    </div>
  );
}

export default function SalonDetail() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { locale } = useI18n();
  const { data: salon, isLoading, isError, error, refetch } = useQuery({ queryKey: ['salon', slug], queryFn: () => get<Salon>(`/salons/${slug}`), retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2 });
  const [serviceId, setServiceId] = useState(params.get('service') ?? '');
  const [staffId, setStaffId] = useState(params.get('staff') ?? '');
  const [date, setDate] = useState(params.get('at') ? localDate(params.get('at')!) : '');
  const [pick, setPick] = useState<string | null>(params.get('at'));
  const grouped = useMemo(() => {
    const m = new Map<string, Salon['services']>();
    salon?.services.forEach((s) => m.set(s.category.name, [...(m.get(s.category.name) ?? []), s]));
    return [...m.entries()];
  }, [salon]);

  const availableStaff = useMemo(() => {
    if (!salon) return [];
    if (!serviceId) return salon.staff;
    return salon.staff.filter((p) => p.serviceIds.includes(serviceId));
  }, [salon, serviceId]);

  if (isLoading) return <div className="container-page space-y-6 py-10"><Skeleton className="h-72 w-full rounded-3xl" /><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40 w-full" /></div>;
  if (isError || !salon) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return <div className="container-page py-16">{notFound ? <div className="mx-auto max-w-md text-center"><h1 className="text-4xl">That salon isn’t available</h1><p className="mt-3 text-ink-soft">It may have been renamed or paused.</p><ButtonLink to="/salons" className="mt-6">Browse salons</ButtonLink></div> : <ErrorState error={error} retry={() => void refetch()} />}</div>;
  }
  const service = salon.services.find((s) => s.id === serviceId);
  const selectedStaff = salon.staff.find((p) => p.id === staffId);
  const bookHref = (extra = '') => `/book/${salon.slug}?${new URLSearchParams({ ...(serviceId ? { service: serviceId } : {}), ...(staffId ? { staff: staffId } : {}), ...(pick ? { at: pick } : {}) })}${extra}`;
  const today = new Date().getDay();
  const rating = Number(salon.avgRating);

  return (
    <div className="container-page pb-28 pt-8 lg:pb-12">
      <Gallery salon={salon} />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">{salon.isVerified && <Badge tone="ok"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Verified business</Badge>}{salon.isDemo && <Badge tone="gold">Demo listing — not a real business</Badge>}</div>
              <h1 className="text-4xl sm:text-5xl">{salon.name}</h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
                {salon.reviewCount > 0 ? <span className="flex items-center gap-2"><Stars value={rating} /><span className="font-semibold text-ink">{rating.toFixed(1)}</span>({salon.reviewCount} review{salon.reviewCount === 1 ? '' : 's'})</span> : <span>No reviews yet</span>}
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />{salon.address}, {salon.neighborhood}</span>
              </p>
            </div>
            <FavoriteButton salonId={salon.id} active={salon.isFavorite} className="border border-line" />
          </div>
          <p className="mt-6 max-w-[68ch] text-[17px] leading-relaxed">{salon.description}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {salon.mapUrl && <a href={salon.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-burgundy hover:underline"><ExternalLink className="h-4 w-4" aria-hidden />Open in maps</a>}
            <a href={`tel:${salon.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-burgundy hover:underline"><Phone className="h-4 w-4" aria-hidden />{salon.phone}</a>
            {salon.instagram && <span className="inline-flex items-center gap-1.5 text-ink-soft"><Instagram className="h-4 w-4" aria-hidden />{salon.instagram}</span>}
          </div>

          <section className="mt-12" aria-labelledby="svc-h">
            <h2 id="svc-h" className="text-3xl">Services</h2>
            {grouped.length === 0 && <p className="mt-4 text-ink-soft">This salon hasn’t published services yet.</p>}
            {grouped.map(([cat, list]) => (
              <div key={cat} className="mt-6">
                <h3 className="font-sans text-sm font-semibold text-gold-ink">{cat}</h3>
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => {
                        setServiceId(s.id);
                        setPick(null);
                        if (staffId && !salon.staff.find((p) => p.id === staffId)?.serviceIds.includes(s.id)) {
                          setStaffId('');
                        }
                        document.getElementById('picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }} aria-pressed={serviceId === s.id}
                        className={cx('flex w-full items-center gap-4 rounded-2xl px-3 py-4 text-left transition-colors hover:bg-blush-soft/60', serviceId === s.id ? 'bg-blush-soft border border-burgundy/30' : 'border border-transparent')}>
                        {s.imageUrl && (
                          <div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-plum/5">
                            <img src={s.imageUrl} alt={s.name} className="h-full w-full object-cover" />
                          </div>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-plum text-base">{s.name}</span>
                          {s.description && <span className="mt-0.5 block text-sm text-ink-soft line-clamp-2">{s.description}</span>}
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                            <span>{duration(s.durationMinutes)}</span>
                            {staffId && salon.staff.find((p) => p.id === staffId)?.serviceIds.includes(s.id) && (
                              <span className="rounded-full bg-ivory-deep px-2 py-0.5 text-xs font-medium text-burgundy">With {salon.staff.find((p) => p.id === staffId)?.displayName}</span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold text-base">{money(s.priceEtb, locale)}</span>
                          {s.originalPriceEtb && <span className="text-xs text-ink-soft line-through">{money(s.originalPriceEtb, locale)}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {salon.staff.length > 0 && (
            <section className="mt-14" aria-labelledby="staff-h">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="staff-h" className="text-3xl">The team</h2>
                <span className="text-sm text-ink-soft">Select who you want for your hair, nails, or styling</span>
              </div>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {salon.staff.map((p) => {
                  const isSelected = staffId === p.id;
                  return (
                    <li key={p.id} className={cx('flex flex-col justify-between gap-3 rounded-2xl border bg-white p-4 transition-all hover:border-burgundy', isSelected ? 'border-burgundy ring-2 ring-burgundy/20 bg-blush-soft/20' : 'border-line')}>
                      <div className="flex gap-4">
                        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-arch bg-plum font-display text-xl text-ivory shadow-soft">
                          {p.avatarUrl ? <img src={p.avatarUrl} alt={p.displayName} className="h-full w-full object-cover" /> : p.displayName[0]}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-plum text-base">{p.displayName}</p>
                          {p.title && <p className="text-sm text-ink-soft">{p.title}</p>}
                          {p.specialties.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {p.specialties.map((spec) => (
                                <span key={spec} className="rounded-md bg-ivory-deep px-2 py-0.5 text-xs font-medium text-plum">
                                  {spec}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-end border-t border-line/60 pt-3">
                        <Button
                          size="sm"
                          variant={isSelected ? 'plum' : 'outline'}
                          onClick={() => {
                            const next = isSelected ? '' : p.id;
                            setStaffId(next);
                            setPick(null);
                            if (next && serviceId && !p.serviceIds.includes(serviceId)) {
                              const matching = salon.services.find((s) => p.serviceIds.includes(s.id));
                              if (matching) setServiceId(matching.id);
                            }
                            document.getElementById('picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                        >
                          {isSelected ? (
                            <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4" />Selected</span>
                          ) : (
                            `Book with ${p.displayName.split(' ')[0]}`
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="mt-14" aria-labelledby="rev-h">
            <h2 id="rev-h" className="text-3xl">Reviews</h2>
            {salon.reviews.length === 0 ? <p className="mt-4 text-ink-soft">No reviews yet. Reviews appear here only after a customer completes an appointment.</p> : (
              <ul className="mt-5 space-y-5">{salon.reviews.map((r) => (
                <li key={r.id} className="border-b border-line pb-5"><div className="flex items-center gap-3"><Stars value={r.rating} /><span className="font-semibold text-plum">{r.reviewer}</span><span className="text-sm text-ink-soft">{fmtDate(r.createdAt)}</span></div>
                  {r.comment && <p className="mt-2 max-w-[68ch]">{r.comment}</p>}{r.ownerReply && <p className="mt-3 rounded-xl bg-ivory-deep p-3 text-sm"><span className="font-semibold">Reply from the salon:</span> {r.ownerReply}</p>}</li>))}</ul>
            )}
          </section>

          <section className="mt-14 grid gap-8 sm:grid-cols-2" aria-labelledby="info-h">
            <div><h2 id="info-h" className="text-3xl">Opening hours</h2>
              <table className="mt-4 w-full text-[15px]"><caption className="sr-only">Opening hours</caption><tbody>{[1, 2, 3, 4, 5, 6, 0].map((d) => { const h = salon.hours.find((x) => x.dayOfWeek === d);
                return <tr key={d} className={cx('border-b border-line', d === today && 'font-semibold text-plum')}><th scope="row" className="py-2 text-left font-[inherit]">{dayName(d)}</th><td className="py-2 text-right">{!h || h.isClosed ? 'Closed' : `${minutesToLabel(h.openMinutes)} – ${minutesToLabel(h.closeMinutes)}`}</td></tr>; })}</tbody></table></div>
            <div><h2 className="text-3xl">Booking policy</h2>
              <ul className="mt-4 space-y-3 text-[15px]"><li className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-burgundy" aria-hidden />{salon.cancellationPolicy}</li>
                <li className="flex gap-3"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-burgundy" aria-hidden />{salon.bookingMode === 'INSTANT' ? 'Bookings are confirmed instantly.' : 'The salon reviews each request and confirms it. You’ll be notified.'}</li>
                <li className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-burgundy" aria-hidden />Pay at the salon after your appointment.</li></ul></div>
          </section>
        </div>

        <aside id="picker" className="lg:sticky lg:top-24 lg:self-start" aria-label="Check availability">
          <div className="rounded-3xl border border-line bg-white p-5 shadow-soft">
            <h2 className="text-2xl">Check open times</h2>
            <div className="mt-4">
              <Select label="1. Service" value={serviceId} onChange={(e) => {
                setServiceId(e.target.value);
                setPick(null);
                if (staffId && e.target.value && !salon.staff.find((p) => p.id === staffId)?.serviceIds.includes(e.target.value)) {
                  setStaffId('');
                }
              }}>
                <option value="">Choose a service</option>
                {salon.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.priceEtb, locale)}</option>)}
              </Select>
            </div>
            <div className="mt-4">
              <Select label="2. Professional" value={staffId} onChange={(e) => { setStaffId(e.target.value); setPick(null); }}>
                <option value="">Any available professional</option>
                {availableStaff.map((p) => <option key={p.id} value={p.id}>{p.displayName} {p.title ? `(${p.title})` : ''}</option>)}
              </Select>
            </div>
            <div className="mt-5">
              <SlotPicker compact slug={salon.slug} serviceId={serviceId} staffId={staffId || undefined} date={date} onDate={(d) => { setDate(d); setPick(null); }} startAt={pick} onPick={(s) => setPick(s.startAt)} />
            </div>
            <Button size="lg" className="mt-5 w-full" onClick={() => navigate(bookHref())} disabled={salon.services.length === 0}>{pick ? 'Continue to book' : 'Book appointment'}</Button>
            {service && (
              <p className="mt-3 text-center text-sm text-ink-soft">
                {service.name} · {duration(service.durationMinutes)} · {money(service.priceEtb, locale)}
                {selectedStaff ? ` · with ${selectedStaff.displayName}` : ' · with any professional'}
                {date ? ` · ${fmtDate(date)}` : ''}
              </p>
            )}
            <p className="mt-3 text-center text-xs text-ink-soft">Times are Addis Ababa time. Today is {fmtDate(localDate())}.</p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 p-3 backdrop-blur lg:hidden">
        <div className="container-page flex items-center gap-3 px-0">
          <div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold text-plum">{salon.name}</p><p className="truncate text-ink-soft">{salon.services[0] ? `From ${money(Math.min(...salon.services.map((s) => Number(s.priceEtb))), locale)}` : 'No services yet'}</p></div>
          <Button size="lg" onClick={() => navigate(bookHref())} disabled={salon.services.length === 0}>Book appointment</Button>
        </div>
      </div>
      <p className="sr-only"><Link to="/salons">Back to all salons</Link></p>
    </div>
  );
}
