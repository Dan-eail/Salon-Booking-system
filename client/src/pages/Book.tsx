import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Clock, MapPin, Users, ShieldCheck, Smartphone, Building, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { normalizePhone } from '@shared/phone';
import { SlotPicker } from '@/components/SlotPicker';
import { Button, ButtonLink, ErrorState, FormError, Input, Skeleton, Textarea } from '@/components/ui';
import { ApiError, get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, duration, fmtTime, localDate, money } from '@/lib/format';
import type { Booking, PaymentInitiation, SalonDetail } from '@/lib/types';
import { cx } from '@/lib/utils';

const STEPS = ['Service', 'Professional', 'Time', 'Your details', 'Review'] as const;
const details = z.object({
  guestName: z.string().trim().min(2, 'Enter your name'),
  guestPhone: z.string().trim().refine((v) => !!normalizePhone(v), 'Enter a valid phone number, e.g. 0911 234 567'),
  guestEmail: z.string().trim().email('Enter a valid email').or(z.literal('')),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters'),
});
type Details = z.infer<typeof details>;

function Stepper({ step, go, reach }: { step: number; go: (n: number) => void; reach: number }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Booking steps">
      {STEPS.map((s, i) => {
        const done = i < step, cur = i === step, can = i <= reach && i < step;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <button disabled={!can} onClick={() => go(i)} aria-current={cur ? 'step' : undefined}
              className={cx('flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold', cur ? 'bg-plum text-ivory' : done ? 'bg-blush text-plum hover:bg-blush/70' : 'bg-ivory-deep text-ink-soft')}>
              {done ? <Check className="h-4 w-4" aria-hidden /> : <span className="grid h-5 w-5 place-items-center rounded-full bg-black/10 text-xs">{i + 1}</span>}{s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-3 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export default function Book() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: salon, isLoading, isError, error, refetch } = useQuery({ queryKey: ['salon', slug], queryFn: () => get<SalonDetail>(`/salons/${slug}`) });

  const [serviceId, setServiceId] = useState(params.get('service') ?? '');
  const [staffId, setStaffId] = useState<string | null>(params.get('staff'));
  const [date, setDate] = useState(params.get('at') ? localDate(params.get('at')!) : '');
  const [startAt, setStartAt] = useState<string | null>(params.get('at'));
  const [step, setStep] = useState(
    params.get('at') && params.get('service')
      ? 3
      : params.get('service')
      ? (params.get('staff') ? 2 : 1)
      : 0
  );
  const [reach, setReach] = useState(Math.max(step, params.get('service') ? 1 : 0));
  const advance = (n: number) => { setStep(n); setReach((r) => Math.max(r, n)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const form = useForm<Details>({ resolver: zodResolver(details), values: { guestName: user?.fullName ?? '', guestPhone: user?.phone ?? '', guestEmail: user?.email ?? '', notes: '' } });
  const service = salon?.services.find((s) => s.id === serviceId);
  const team = salon?.staff.filter((p) => p.serviceIds.includes(serviceId)) ?? [];
  const chosen = salon?.staff.find((p) => p.id === staffId);

  const book = useMutation({
    mutationFn: async (d: Details) => {
      // 1. Create appointment
      const b = await post<Booking>('/me/appointments', {
        salonId: salon!.id,
        serviceId,
        staffId,
        startAt,
        guestName: d.guestName,
        guestPhone: d.guestPhone,
        guestEmail: d.guestEmail || null,
        notes: d.notes || null,
      });

      // 2. Initiate Chapa 50% deposit payment
      const payment = await post<PaymentInitiation>(`/me/appointments/${b.id}/pay`, {});
      return { booking: b, payment };
    },
    onSuccess: ({ booking, payment }) => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['slots'] });
      void qc.invalidateQueries({ queryKey: ['range'] });

      if (payment.checkoutUrl) {
        if (payment.isSimulation) {
          navigate(
            `/payment/test-checkout?tx_ref=${encodeURIComponent(payment.txRef)}&appointment_id=${encodeURIComponent(booking.id)}&amount=${encodeURIComponent(payment.depositEtb)}`,
          );
        } else {
          window.location.href = payment.checkoutUrl;
        }
      } else {
        navigate(`/booking/${booking.id}/confirmed`, { replace: true });
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') {
        setStartAt(null);
        void qc.invalidateQueries({ queryKey: ['slots'] });
        void qc.invalidateQueries({ queryKey: ['range'] });
        setStep(2);
      }
    },
  });

  if (isLoading) return <div className="container-page max-w-3xl space-y-4 py-10"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !salon) return <div className="container-page py-16"><ErrorState error={error} retry={() => void refetch()} /></div>;

  const returnTo = `/book/${slug}?${new URLSearchParams({ service: serviceId, ...(staffId ? { staff: staffId } : {}), ...(startAt ? { at: startAt } : {}) })}`;

  return (
    <div className="container-page max-w-5xl py-8">
      <Link to={`/salons/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-burgundy hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{salon.name}</Link>
      <h1 className="mb-5 mt-3 text-4xl">Book an appointment</h1>
      <Stepper step={step} go={setStep} reach={reach} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {step === 0 && (
            <section aria-labelledby="s0">
              <h2 id="s0" className="mb-2 text-2xl">Choose a service</h2>
              <p className="mb-5 text-sm text-ink-soft">Select the treatment you would like to book today.</p>
              <ul className="space-y-3">
                {salon.services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => { setServiceId(s.id); setStaffId(null); setStartAt(null); advance(1); }}
                      aria-pressed={serviceId === s.id}
                      className={cx(
                        'flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition hover:border-burgundy',
                        serviceId === s.id ? 'border-burgundy ring-2 ring-burgundy/15' : 'border-line'
                      )}
                    >
                      {s.imageUrl && (
                        <img
                          src={s.imageUrl}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-arch object-cover shadow-soft"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-plum text-base">{s.name}</span>
                        {s.description && (
                          <span className="mt-0.5 block text-sm text-ink-soft line-clamp-1">{s.description}</span>
                        )}
                        <span className="mt-1 block text-sm text-ink-soft">
                          {s.category.name} · {duration(s.durationMinutes)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold text-base text-plum">{money(s.priceEtb)}</span>
                        {s.originalPriceEtb && (
                          <span className="text-xs text-ink-soft line-through">{money(s.originalPriceEtb)}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {salon.services.length === 0 && <p className="text-ink-soft">This salon has no bookable services yet.</p>}
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="s1">
              <div className="mb-6">
                <h2 id="s1" className="text-2xl">
                  {service ? `Who would you like for your ${service.name.toLowerCase()}?` : 'Choose a professional'}
                </h2>
                <p className="mt-1 text-ink-soft">
                  Select your preferred stylist or specialist for your hair, nails, or treatment, or choose any professional for the fastest open slots.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => { setStaffId(null); setStartAt(null); advance(2); }}
                  aria-pressed={staffId === null}
                  className={cx(
                    'group flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition hover:border-burgundy',
                    staffId === null ? 'border-burgundy ring-2 ring-burgundy/15 bg-blush-soft/20' : 'border-line'
                  )}
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-arch bg-blush text-plum group-hover:scale-105 transition">
                    <Users className="h-6 w-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-plum text-base">Any available professional</span>
                      {staffId === null && (
                        <span className="rounded-full bg-burgundy px-2 py-0.5 text-xs font-medium text-ivory">Selected</span>
                      )}
                    </div>
                    <p className="text-sm text-ink-soft">
                      Maximum availability — the salon assigns the best available specialist for your appointment time.
                    </p>
                  </div>
                </button>

                {team.map((p) => {
                  const isSelected = staffId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setStaffId(p.id); setStartAt(null); advance(2); }}
                      aria-pressed={isSelected}
                      className={cx(
                        'group flex w-full items-start gap-4 rounded-2xl border bg-white p-4 text-left transition hover:border-burgundy',
                        isSelected ? 'border-burgundy ring-2 ring-burgundy/15 bg-blush-soft/20' : 'border-line'
                      )}
                    >
                      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-arch bg-plum font-display text-lg text-ivory shadow-soft group-hover:scale-105 transition">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt={p.displayName} className="h-full w-full object-cover" />
                        ) : (
                          p.displayName[0]
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-semibold text-plum text-base">{p.displayName}</span>
                          {isSelected && (
                            <span className="rounded-full bg-burgundy px-2 py-0.5 text-xs font-medium text-ivory">Selected</span>
                          )}
                        </div>
                        {p.title && <p className="text-sm font-medium text-burgundy">{p.title}</p>}
                        {p.bio && <p className="mt-1 text-sm text-ink-soft line-clamp-2">{p.bio}</p>}
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
                    </button>
                  );
                })}

                {team.length === 0 && (
                  <p className="rounded-xl bg-blush-soft p-4 text-sm">
                    No one is assigned to this service yet, so it can’t be booked. Try another service or contact the salon.
                  </p>
                )}
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="s2">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-4 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-arch bg-plum font-display text-lg text-ivory shadow-soft">
                    {chosen?.avatarUrl ? (
                      <img src={chosen.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : chosen ? (
                      chosen.displayName[0]
                    ) : (
                      <Users className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-burgundy">Chosen Professional</span>
                    <p className="font-semibold text-plum">{chosen ? chosen.displayName : 'Any available professional'}</p>
                    {chosen?.title && <p className="text-xs text-ink-soft">{chosen.title}</p>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => advance(1)}>
                  Change professional
                </Button>
              </div>

              <h2 id="s2" className="mb-4 text-2xl">Pick a date and time</h2>
              {book.error instanceof ApiError && book.error.code === 'SLOT_UNAVAILABLE' && <div className="mb-4"><FormError error={book.error} /></div>}
              <SlotPicker slug={slug} serviceId={serviceId} staffId={staffId} date={date} onDate={(d) => { setDate(d); setStartAt(null); }} startAt={startAt} onPick={(s) => setStartAt(s.startAt)} />
              <div className="mt-6 flex justify-end"><Button size="lg" disabled={!startAt} onClick={() => advance(3)}>Continue</Button></div>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="s3">
              <h2 id="s3" className="mb-4 text-2xl">Your details</h2>
              {ready && !user ? (
                <div className="rounded-2xl border border-line bg-white p-6">
                  <p className="font-semibold text-plum">Sign in to finish booking</p>
                  <p className="mt-1 text-[15px] text-ink-soft">Your time is held in this page. Signing in lets you manage, change or cancel the booking later. Your choices are kept.</p>
                  <div className="mt-4 flex flex-wrap gap-3"><ButtonLink to="/login" state={{ from: returnTo }}>Sign in</ButtonLink><ButtonLink to="/register" state={{ from: returnTo }} variant="outline">Create account</ButtonLink></div>
                </div>
              ) : (
                <form onSubmit={form.handleSubmit(() => advance(4))} noValidate className="space-y-4 rounded-2xl border border-line bg-white p-6">
                  <Input label="Full name" autoComplete="name" error={form.formState.errors.guestName?.message} {...form.register('guestName')} />
                  <Input label="Phone number" type="tel" inputMode="tel" autoComplete="tel" hint="The salon may call you about your booking." error={form.formState.errors.guestPhone?.message} {...form.register('guestPhone')} />
                  <Input label="Email" type="email" autoComplete="email" optional error={form.formState.errors.guestEmail?.message} {...form.register('guestEmail')} />
                  <Textarea label="Notes for the salon" optional placeholder="Hair length, nail style preferences, allergies, inspiration…" error={form.formState.errors.notes?.message} {...form.register('notes')} />
                  <div className="flex justify-end"><Button size="lg" type="submit">Review booking</Button></div>
                </form>
              )}
            </section>
          )}

          {step === 4 && service && startAt && (
            <section aria-labelledby="s4">
              <h2 id="s4" className="mb-4 text-2xl">Review and confirm</h2>
              <div className="space-y-4 rounded-2xl border border-line bg-white p-6">
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr] [&_dt]:text-sm [&_dt]:text-ink-soft [&_dd]:font-medium">
                  <dt>Salon</dt>
                  <dd>{salon.name}, {salon.neighborhood}</dd>
                  <dt>Service</dt>
                  <dd className="flex items-center gap-2">
                    {service.imageUrl && (
                      <img src={service.imageUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
                    )}
                    <span>{service.name} · {duration(service.durationMinutes)}</span>
                  </dd>
                  <dt>Professional</dt>
                  <dd className="flex items-center gap-2">
                    {chosen?.avatarUrl ? (
                      <img src={chosen.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : null}
                    <span className="font-semibold text-plum">{chosen?.displayName ?? 'Any available professional'}</span>
                    {chosen?.title && <span className="text-xs text-ink-soft font-normal">({chosen.title})</span>}
                  </dd>
                  <dt>When</dt>
                  <dd>{dateLabel(localDate(startAt))} at {fmtTime(startAt)}</dd>
                  <dt>Name</dt>
                  <dd>{form.getValues('guestName')}</dd>
                  <dt>Phone</dt>
                  <dd>{form.getValues('guestPhone')}</dd>
                  <dt>Total price</dt>
                  <dd className="text-base font-semibold text-plum">{money(service.priceEtb)}</dd>
                </dl>

                {/* 50% Deposit & Ethiopian Payment Method Card */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                        <Smartphone className="h-4 w-4" />
                      </span>
                      <span className="font-bold text-emerald-950 text-base">50% Online Deposit Required</span>
                    </div>
                    <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                      Due now: {money((Number(service.priceEtb) * 0.5).toFixed(2))}
                    </span>
                  </div>

                  <p className="text-sm text-emerald-900/80">
                    Pay 50% deposit securely now via <strong>Telebirr</strong>, <strong>CBE Birr</strong>, or card with <strong>Chapa</strong>. The remaining 50% ({money((Number(service.priceEtb) * 0.5).toFixed(2))}) is paid directly at the salon after your treatment.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-200/60">
                    <span className="text-xs font-semibold text-emerald-900">Supported methods:</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-2xs">
                      <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
                      Telebirr
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-bold text-purple-800 border border-purple-200 shadow-2xs">
                      <Building className="h-3.5 w-3.5 text-purple-600" />
                      CBE Birr
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-bold text-blue-800 border border-blue-200 shadow-2xs">
                      <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                      Cards
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-bold text-gray-800 border border-gray-200 shadow-2xs">
                      <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                      Chapa
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-ivory-deep p-4 text-sm">
                  <p className="font-semibold text-plum">Cancellation policy</p>
                  <p className="mt-1">{salon.cancellationPolicy}</p>
                  <p className="mt-2">{salon.bookingMode === 'INSTANT' ? 'Your booking will be confirmed automatically once the 50% deposit is paid.' : 'The salon will review your request. You’ll receive notification.'}</p>
                </div>
                <FormError error={book.error} />
                <div className="flex flex-wrap justify-between gap-3">
                  <Button variant="outline" onClick={() => setStep(3)}>Edit details</Button>
                  <Button size="lg" loading={book.isPending} onClick={() => book.mutate(form.getValues())}>
                    Pay 50% Deposit ({money((Number(service.priceEtb) * 0.5).toFixed(2))}) & Confirm
                  </Button>
                </div>
              </div>
            </section>
          )}
          {step === 4 && (!service || !startAt) && <ErrorState error={new Error('x')} retry={() => setStep(0)} />}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Booking summary">
          <div className="overflow-hidden rounded-arch border border-line bg-white p-6 pt-10 text-[15px] shadow-soft">
            {salon.coverImage && (
              <div className="-mx-6 -mt-10 mb-4 h-28 overflow-hidden">
                <img src={salon.coverImage} alt={salon.name} className="h-full w-full object-cover" />
              </div>
            )}
            <p className="font-display text-xl text-plum">{salon.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5" aria-hidden />{salon.neighborhood}</p>
            <hr className="my-4 border-line" />
            {service ? (
              <div className="flex items-start gap-3">
                {service.imageUrl && (
                  <img src={service.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-xs" />
                )}
                <div>
                  <p className="font-semibold text-plum">{service.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft"><Clock className="h-3.5 w-3.5" aria-hidden />{duration(service.durationMinutes)}</p>
                </div>
              </div>
            ) : <p className="text-ink-soft">No service chosen yet</p>}

            {step > 0 && (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-ivory-deep p-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-plum text-xs font-display text-ivory">
                  {chosen?.avatarUrl ? (
                    <img src={chosen.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : chosen ? (
                    chosen.displayName[0]
                  ) : (
                    <Users className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 text-xs">
                  <span className="text-ink-soft block">Professional</span>
                  <span className="font-semibold text-plum truncate block">
                    {chosen?.displayName ?? 'Any professional'}
                  </span>
                </div>
              </div>
            )}

            {startAt && <p className="mt-3 rounded-lg bg-blush px-3 py-2 font-semibold text-plum">{dateLabel(localDate(startAt))}<br />{fmtTime(startAt)}</p>}
            {service && (
              <div className="mt-4 border-t border-line pt-4 space-y-2">
                <div className="flex items-baseline justify-between text-ink-soft text-sm">
                  <span>Service total</span>
                  <span className="font-semibold text-plum">{money(service.priceEtb)}</span>
                </div>
                <div className="flex items-baseline justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-bold text-emerald-800">
                  <span>50% Deposit due now</span>
                  <span>{money((Number(service.priceEtb) * 0.5).toFixed(2))}</span>
                </div>
                <div className="flex items-baseline justify-between text-ink-soft text-xs">
                  <span>Remaining 50% at salon</span>
                  <span>{money((Number(service.priceEtb) * 0.5).toFixed(2))}</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
