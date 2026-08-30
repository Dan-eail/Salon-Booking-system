import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List, MapPin, SlidersHorizontal, Search as SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SalonCard, SalonCardSkeleton } from '@/components/SalonCard';
import { Button, Empty, ErrorState, Input, Modal, Pagination, Select } from '@/components/ui';
import { useMeta } from '@/hooks/queries';
import { getPage } from '@/lib/api';
import { addDays, localDate } from '@/lib/format';
import type { SalonCard as Salon } from '@/lib/types';
import { cx } from '@/lib/utils';

const KEYS = ['q', 'neighborhood', 'category', 'minPrice', 'maxPrice', 'minRating', 'date', 'timeFrom', 'timeTo'] as const;
const PRICE_BANDS = [{ l: 'Any price', min: '', max: '' }, { l: 'Under ETB 500', min: '', max: '500' }, { l: 'ETB 500 – 1,000', min: '500', max: '1000' }, { l: 'ETB 1,000 – 2,000', min: '1000', max: '2000' }, { l: 'ETB 2,000+', min: '2000', max: '' }];
const TIMES = [{ l: 'Any time', from: '', to: '' }, { l: 'Morning (before 12:00)', from: '06:00', to: '11:59' }, { l: 'Afternoon (12:00 – 16:59)', from: '12:00', to: '16:59' }, { l: 'Evening (17:00+)', from: '17:00', to: '23:00' }];

function Filters({ params, set }: { params: URLSearchParams; set: (patch: Record<string, string>) => void }) {
  const { data: meta } = useMeta();
  const today = localDate();
  const band = PRICE_BANDS.findIndex((b) => b.min === (params.get('minPrice') ?? '') && b.max === (params.get('maxPrice') ?? ''));
  const time = TIMES.findIndex((t) => t.from === (params.get('timeFrom') ?? '') && t.to === (params.get('timeTo') ?? ''));
  return (
    <div className="space-y-5">
      <Select label="Area" value={params.get('neighborhood') ?? ''} onChange={(e) => set({ neighborhood: e.target.value })}>
        <option value="">All of Addis Ababa</option>{meta?.locations.map((l) => <option key={l.id} value={l.neighborhood}>{l.neighborhood}</option>)}
      </Select>
      <Select label="Service type" value={params.get('category') ?? ''} onChange={(e) => set({ category: e.target.value })}>
        <option value="">All services</option>{meta?.categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
      </Select>
      <Select label="Price" value={String(Math.max(band, 0))} onChange={(e) => { const b = PRICE_BANDS[Number(e.target.value)]; set({ minPrice: b.min, maxPrice: b.max }); }}>
        {PRICE_BANDS.map((b, i) => <option key={b.l} value={i}>{b.l}</option>)}
      </Select>
      <Select label="Rating" value={params.get('minRating') ?? ''} onChange={(e) => set({ minRating: e.target.value })}>
        <option value="">Any rating</option><option value="4.5">4.5 and up</option><option value="4">4.0 and up</option><option value="3">3.0 and up</option>
      </Select>
      <Input label="Available on" type="date" min={today} max={addDays(today, 60)} value={params.get('date') ?? ''} onChange={(e) => set({ date: e.target.value, ...(e.target.value ? {} : { timeFrom: '', timeTo: '' }) })} hint="Only salons with a free slot that day" />
      <Select label="Time of day" disabled={!params.get('date')} value={String(Math.max(time, 0))} onChange={(e) => { const t = TIMES[Number(e.target.value)]; set({ timeFrom: t.from, timeTo: t.to }); }} hint={params.get('date') ? undefined : 'Choose a date first'}>
        {TIMES.map((t, i) => <option key={t.l} value={i}>{t.l}</option>)}
      </Select>
    </div>
  );
}

export default function Salons() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sheet, setSheet] = useState(false);
  const [text, setText] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort') ?? 'relevance';

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => { const id = setTimeout(() => { if (text !== (params.get('q') ?? '')) set({ q: text }); }, 350); return () => clearTimeout(id); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setText(params.get('q') ?? ''); }, [params.get('q')]); // eslint-disable-line

  const query = Object.fromEntries([...KEYS.map((k) => [k, params.get(k) ?? '']), ['sort', sort], ['page', page], ['pageSize', 12]]);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({ queryKey: ['salons', query], queryFn: () => getPage<Salon>('/salons', query), placeholderData: (p) => p });
  const active = KEYS.filter((k) => params.get(k) && !(k === 'timeFrom' || k === 'timeTo')).length;
  const clear = () => { setText(''); setParams(new URLSearchParams(), { replace: true }); };

  return (
    <div className="container-page py-10">
      <h1 className="text-4xl sm:text-5xl">Find a salon</h1>
      <p className="mt-2 text-ink-soft">{data ? `${data.meta?.total ?? 0} salon${data.meta?.total === 1 ? '' : 's'}` : 'Searching…'}{params.get('neighborhood') ? ` in ${params.get('neighborhood')}` : ' across Addis Ababa'}</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="relative min-w-64 flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-[38px] h-[18px] w-[18px] text-ink-soft" aria-hidden />
          <Input label="Search salons, services or areas" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “braids” or “Bole”" className="pl-11" type="search" />
        </div>
        <div className="w-44"><Select label="Sort by" value={sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="relevance">Recommended</option><option value="rating">Highest rated</option><option value="popularity">Most booked</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
        </Select></div>
        <div className="flex gap-1 pb-0.5" role="group" aria-label="Layout">
          {([['grid', LayoutGrid, 'Grid view'], ['list', List, 'List view']] as const).map(([v, I, l]) => (
            <Button key={v} variant={view === v ? 'plum' : 'outline'} size="icon" aria-label={l} aria-pressed={view === v} onClick={() => setView(v)} className="h-12 w-12"><I className="h-5 w-5" /></Button>
          ))}
        </div>
        <Button variant="outline" className="h-12 lg:hidden" onClick={() => setSheet(true)}><SlidersHorizontal className="h-4 w-4" aria-hidden />Filters{active > 0 && ` (${active})`}</Button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters"><div className="sticky top-24 space-y-5 rounded-2xl border border-line bg-white p-5"><Filters params={params} set={set} />{active > 0 && <Button variant="ghost" size="sm" onClick={clear} className="w-full">Clear all filters</Button>}</div></aside>
        <section aria-live="polite" aria-busy={isFetching}>
          {isError ? <ErrorState error={error} retry={() => void refetch()} /> : isLoading ? (
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <SalonCardSkeleton key={i} />)}</div>
          ) : data && data.data.length === 0 ? (
            <Empty icon={<MapPin className="h-8 w-8" />} title="No salons match those filters" body="Try a different area, a wider price range, or another date." action={<Button onClick={clear}>Clear all filters</Button>} />
          ) : (
            <div className={cx('transition-opacity', isFetching && 'opacity-60', view === 'grid' ? 'grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3' : 'grid gap-8')}>
              {data?.data.map((s) => view === 'grid' ? <SalonCard key={s.id} salon={s} /> : <div key={s.id} className="max-w-xl"><SalonCard salon={s} /></div>)}
            </div>
          )}
          <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </section>
      </div>

      <Modal open={sheet} onOpenChange={setSheet} title="Filters">
        <Filters params={params} set={set} />
        <div className="mt-6 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => { clear(); setSheet(false); }}>Clear all</Button><Button className="flex-1" onClick={() => setSheet(false)}>Show {data?.meta?.total ?? ''} salons</Button></div>
      </Modal>
    </div>
  );
}
