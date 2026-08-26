import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui';
import { get } from '@/lib/api';
import { fmtTime, localDate } from '@/lib/format';
import type { Slot } from '@/lib/types';
import { cx } from '@/lib/utils';

const dow = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const dom = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const at = (d: string) => new Date(`${d}T12:00:00Z`);

/** Date strip + time grid, both driven by the server's real availability. */
export function SlotPicker({ slug, serviceId, staffId, date, onDate, startAt, onPick, compact }: {
  slug: string; serviceId: string; staffId?: string | null; date: string; onDate: (d: string) => void; startAt: string | null; onPick: (slot: Slot) => void; compact?: boolean }) {
  const today = localDate();
  const range = useQuery({
    queryKey: ['range', slug, serviceId, staffId], enabled: !!serviceId, staleTime: 30_000,
    queryFn: () => get<{ date: string; slots: number }[]>(`/salons/${slug}/availability-range`, { serviceId, from: today, days: 21, staffId }),
  });
  const slots = useQuery({
    queryKey: ['slots', slug, serviceId, staffId, date], enabled: !!serviceId && !!date, staleTime: 15_000,
    queryFn: () => get<{ slots: Slot[] }>(`/salons/${slug}/availability`, { serviceId, date, staffId }),
  });
  const firstOpen = range.data?.find((d) => d.slots > 0)?.date;
  const picked = useRef(false);
  // Jump to the first day that actually has room, unless the person already chose a day.
  useEffect(() => { if (!picked.current && firstOpen && (!date || range.data?.find((d) => d.date === date)?.slots === 0)) onDate(firstOpen); }, [firstOpen]); // eslint-disable-line

  if (!serviceId) return <p className="text-sm text-ink-soft">Choose a service to see open times.</p>;
  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3" role="listbox" aria-label="Choose a date">
        {range.isLoading ? Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 w-14 shrink-0 rounded-2xl" />) : range.data?.map((d) => {
          const sel = d.date === date, none = d.slots === 0;
          return (
            <button type="button" key={d.date} role="option" aria-selected={sel} disabled={none} onClick={() => { picked.current = true; onDate(d.date); }}
              className={cx('flex h-[68px] w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition', sel ? 'border-plum bg-plum text-ivory shadow-soft' : none ? 'cursor-not-allowed border-line/60 bg-ivory-deep/60 text-ink-soft/50' : 'border-line bg-white text-plum hover:border-burgundy')}>
              <span className="text-xs font-medium">{d.date === today ? 'Today' : dow.format(at(d.date))}</span>
              <span className="text-[15px] font-semibold leading-tight">{dom.format(at(d.date))}</span>
            </button>
          );
        })}
      </div>
      {range.data && !firstOpen && <p className="rounded-xl bg-blush-soft p-4 text-sm text-ink">No open times in the next three weeks for this service. Try another professional, or contact the salon.</p>}
      <div className={cx('mt-2 grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5')} aria-live="polite">
        {slots.isLoading && date ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-11" />) : slots.data?.slots.map((s) => (
          <button type="button" key={s.startAt} onClick={() => onPick(s)} aria-pressed={startAt === s.startAt}
            className={cx('h-11 rounded-xl border text-sm font-semibold transition', startAt === s.startAt ? 'border-burgundy bg-burgundy text-ivory shadow-soft' : 'border-line bg-white text-plum hover:border-burgundy')}>{fmtTime(s.startAt)}</button>
        ))}
      </div>
      {slots.data && slots.data.slots.length === 0 && date && <p className="mt-3 text-sm text-ink-soft">Fully booked on this day.</p>}
      {slots.isError && <p role="alert" className="mt-3 text-sm text-danger">Couldn’t load times. Check your connection and pick the date again.</p>}
    </div>
  );
}
