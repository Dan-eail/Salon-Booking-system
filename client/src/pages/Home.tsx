import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarSearch, Clock3, Quote, Scissors, Search, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tilet } from '@/components/Art';
import { SalonCard, SalonCardSkeleton } from '@/components/SalonCard';
import { ButtonLink, Button, Select } from '@/components/ui';
import { useMeta } from '@/hooks/queries';
import { useI18n } from '@/i18n';
import { get, getPage } from '@/lib/api';
import { addDays, fmtDate, localDate, money, duration } from '@/lib/format';
import type { SalonCard as Salon } from '@/lib/types';

type Popular = { id: string; name: string; durationMinutes: number; priceEtb: string; salonName: string; salonSlug: string; neighborhood: string; imageUrl?: string | null };
type Promo = { id: string; title: string; description: string; type: 'PERCENT' | 'FIXED'; value: string; endsAt: string };
type Testimonial = { id: string; rating: number; comment: string; reviewer: string; salonName: string; salonSlug: string };

function SearchBar() {
  const { t } = useI18n();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const [where, setWhere] = useState('');
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const today = localDate();
  const go = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (where) p.set('neighborhood', where);
    if (what) p.set('category', what);
    if (when) p.set('date', when);
    navigate(`/salons?${p}`);
  };
  return (
    <form onSubmit={go} className="grid gap-3 rounded-3xl border border-line bg-white p-3 shadow-lift sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_auto] lg:items-end lg:rounded-full lg:p-2.5 lg:pl-6" aria-label="Find a salon">
      <Select label={t('search.where')} value={where} onChange={(e) => setWhere(e.target.value)} className="border-0 bg-transparent px-0 focus:ring-0 lg:h-9">
        <option value="">{t('search.anywhere')}</option>{meta?.locations.map((l) => <option key={l.id} value={l.neighborhood}>{l.neighborhood}</option>)}
      </Select>
      <Select label={t('search.what')} value={what} onChange={(e) => setWhat(e.target.value)} className="border-0 bg-transparent px-0 focus:ring-0 lg:h-9">
        <option value="">{t('search.anything')}</option>{meta?.categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
      </Select>
      <div className="space-y-1.5">
        <label htmlFor="home-date" className="block text-sm font-semibold text-plum">{t('search.when')}</label>
        <input id="home-date" type="date" min={today} max={addDays(today, 60)} value={when} onChange={(e) => setWhen(e.target.value)} className="h-12 w-full rounded-xl border-0 bg-transparent px-0 text-[15px] focus:outline-none focus:ring-0 lg:h-9" />
      </div>
      <Button size="lg" type="submit" className="sm:col-span-2 lg:col-span-1"><Search className="h-5 w-5" aria-hidden />{t('search.go')}</Button>
    </form>
  );
}

const steps = [
  { icon: Search, title: 'Choose a service', body: 'Browse salons by area and price. Every service shows its duration and cost in birr.' },
  { icon: Scissors, title: 'Pick a professional', body: 'Choose the stylist you like, or let the salon assign whoever is free.' },
  { icon: CalendarSearch, title: 'Pick a time', body: 'You only see times that are genuinely open — checked against the salon’s diary as you book.' },
  { icon: Sparkles, title: 'Confirm and go', body: 'Get a booking reference straight away. Pay at the salon after your appointment.' },
];

export default function Home() {
  const { t, locale } = useI18n();
  const { data: meta } = useMeta();
  const featured = useQuery({ queryKey: ['salons', 'featured'], queryFn: () => getPage<Salon>('/salons', { sort: 'popularity', pageSize: 6 }) });
  const popular = useQuery({ queryKey: ['popular'], queryFn: () => get<Popular[]>('/popular-services') });
  const promos = useQuery({ queryKey: ['promos'], queryFn: () => get<Promo[]>('/promotions') });
  const reviews = useQuery({ queryKey: ['testimonials'], queryFn: () => get<Testimonial[]>('/testimonials') });

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="container-page grid items-center gap-10 pb-16 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-16">
          <div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }} className="max-w-[14ch] text-[2.9rem] sm:text-6xl lg:text-[5.2rem]">{t('hero.title')}</motion.h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-ink-soft">{t('hero.sub')}</p>
            <div className="mt-9 max-w-3xl lg:-mr-24 lg:relative lg:z-10"><SearchBar /></div>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md lg:block" aria-hidden>
            <div className="absolute -left-4 top-14 w-[58%] rotate-[-4deg] overflow-hidden rounded-arch shadow-lift transition-transform hover:rotate-0 duration-300">
              <img src="/images/salons/meskel.jpg" alt="Meskel Flower Nails" className="aspect-[4/5] w-full object-cover" />
            </div>
            <div className="relative ml-auto w-[68%] overflow-hidden rounded-arch shadow-lift transition-transform hover:scale-[1.02] duration-300">
              <img src="/images/salons/zewditu.jpg" alt="Zewditu Hair Studio" className="aspect-[4/5] w-full object-cover" />
            </div>
          </div>
        </div>
        <Tilet />
      </section>

      <section className="container-page mt-20" aria-labelledby="cat-h">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div><h2 id="cat-h" className="text-4xl sm:text-5xl">The menu</h2><p className="mt-3 max-w-sm text-ink-soft">Hair, nails and bridal — pick a category to see the salons that offer it.</p></div>
          <ul className="divide-y divide-line border-y border-line">
            {(meta?.categories ?? Array.from({ length: 9 })).map((c, i) => (
              <li key={c ? (c as { id: string }).id : i}>
                {c ? (
                  <Link to={`/salons?category=${(c as { slug: string }).slug}`} className="group flex items-baseline gap-4 py-4 transition-colors hover:bg-blush-soft/60 sm:px-3">
                    <span className="font-display text-2xl text-plum sm:text-[1.7rem]">{(c as { name: string }).name}</span>
                    <span className="hidden text-ink-soft sm:inline" lang="am">{(c as { nameAm: string | null }).nameAm}</span>
                    <ArrowRight className="ml-auto h-5 w-5 shrink-0 translate-x-0 self-center text-burgundy opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                  </Link>
                ) : <div className="skeleton my-4 h-8 w-2/3" />}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-page mt-24" aria-labelledby="feat-h">
        <div className="mb-8 flex items-end justify-between gap-4"><h2 id="feat-h" className="text-4xl sm:text-5xl">Popular salons</h2><Link to="/salons" className="hidden items-center gap-1.5 font-semibold text-burgundy hover:underline sm:flex">See all salons<ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
        {featured.isError ? <p className="text-ink-soft">We couldn’t load salons right now. Refresh to try again.</p> : (
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {featured.isLoading ? Array.from({ length: 3 }, (_, i) => <SalonCardSkeleton key={i} />) : featured.data?.data.map((s, i) => <SalonCard key={s.id} salon={s} priority={i < 3} />)}
          </div>
        )}
      </section>

      {!!popular.data?.length && (
        <section className="container-page mt-24" aria-labelledby="pop-h">
          <h2 id="pop-h" className="mb-6 text-3xl sm:text-4xl">Most booked treatments</h2>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {popular.data.slice(0, 6).map((s) => (
              <li key={s.id} className="border-b border-line">
                <Link to={`/salons/${s.salonSlug}`} className="group flex items-center justify-between gap-4 py-4 hover:text-burgundy">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {s.imageUrl && (
                      <img
                        src={s.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-soft transition group-hover:scale-105"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block font-semibold text-plum group-hover:text-burgundy truncate">{s.name}</span>
                      <span className="text-sm text-ink-soft truncate block">{s.salonName} · {s.neighborhood} · {duration(s.durationMinutes)}</span>
                    </span>
                  </div>
                  <span className="shrink-0 font-semibold">{money(s.priceEtb, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!promos.data?.length && (
        <section className="container-page mt-24" aria-labelledby="promo-h">
          <h2 id="promo-h" className="mb-6 text-3xl sm:text-4xl">Offers</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {promos.data.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center gap-5 rounded-2xl bg-blush p-5">
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-arch bg-plum text-center font-display text-xl text-ivory">{p.type === 'PERCENT' ? `${Number(p.value)}%` : money(p.value, locale).replace('ETB ', '')}<span className="sr-only"> off</span></div>
                <div><h3 className="text-xl">{p.title}</h3><p className="mt-1 text-sm text-ink-soft">{p.description}</p><p className="mt-1.5 text-xs font-semibold text-plum">Until {fmtDate(p.endsAt)}</p></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="how" className="container-page mt-24 scroll-mt-24" aria-labelledby="how-h">
        <h2 id="how-h" className="mb-10 max-w-xl text-4xl sm:text-5xl">Four taps from idea to chair</h2>
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="relative border-t-2 border-plum pt-5">
              <span className="absolute -top-px right-0 font-display text-6xl leading-none text-blush" aria-hidden>{i + 1}</span>
              <s.icon className="h-6 w-6 text-burgundy" aria-hidden /><h3 className="mt-4 text-xl">{s.title}</h3><p className="mt-2 text-[15px] text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {!!reviews.data?.length && (
        <section className="container-page mt-24" aria-labelledby="rev-h">
          <h2 id="rev-h" className="mb-8 text-3xl sm:text-4xl">What customers wrote</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {reviews.data.slice(0, 3).map((r) => (
              <figure key={r.id} className="rounded-2xl border border-line bg-white p-6">
                <Quote className="h-6 w-6 text-gold" aria-hidden /><blockquote className="mt-3 text-[15px] leading-relaxed">{r.comment}</blockquote>
                <figcaption className="mt-4 text-sm text-ink-soft"><span className="font-semibold text-plum">{r.reviewer}</span> on <Link className="underline" to={`/salons/${r.salonSlug}`}>{r.salonName}</Link></figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="container-page mt-24">
        <div className="overflow-hidden rounded-3xl bg-plum text-ivory">
          <Tilet thin />
          <div className="grid items-center gap-8 p-8 sm:p-12 md:grid-cols-[1.3fr_1fr]">
            <div>
              <h2 className="text-4xl text-ivory sm:text-5xl">Grow your salon with us</h2>
              <p className="mt-4 max-w-[52ch] text-lg text-ivory/80">Let clients book your open hours any time of day. You set services, prices, staff shifts and cancellation rules — and approve bookings yourself if you prefer.</p>
              <div className="mt-7 flex flex-wrap gap-3"><ButtonLink to="/register?type=owner" size="lg" className="bg-gold text-plum hover:bg-gold/85">List your salon</ButtonLink><ButtonLink to="/for-salons" size="lg" variant="outline" className="border-ivory/40 text-ivory hover:border-ivory hover:bg-ivory/10">See how it works</ButtonLink></div>
            </div>
            <ul className="space-y-3 text-[15px] text-ivory/85">
              {['Online diary with day, week and month views', 'Booking approval or instant confirmation — your choice', 'Reports you can export to CSV', 'Works on any phone — nothing to install'].map((x) => <li key={x} className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />{x}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
