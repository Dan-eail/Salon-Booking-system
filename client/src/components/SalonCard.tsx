import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Heart, MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchArt } from '@/components/Art';
import { Badge } from '@/components/ui';
import { del, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import type { SalonCard as Salon } from '@/lib/types';
import { cx } from '@/lib/utils';

export function FavoriteButton({ salonId, active, className }: { salonId: string; active: boolean; className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => (active ? del(`/me/favorites/${salonId}`) : put(`/me/favorites/${salonId}`)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['salons'] }); void qc.invalidateQueries({ queryKey: ['salon'] }); void qc.invalidateQueries({ queryKey: ['favorites'] }); toast.success(active ? 'Removed from favorites' : 'Saved to favorites'); },
    onError: () => toast.error('Could not update favorites. Try again.'),
  });
  return (
    <button type="button" aria-pressed={active} aria-label={active ? 'Remove from favorites' : 'Save to favorites'} disabled={m.isPending}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!user) { toast('Sign in to save salons'); navigate('/login', { state: { from: location.pathname + location.search } }); return; } m.mutate(); }}
      className={cx('grid h-10 w-10 place-items-center rounded-full bg-ivory/95 text-plum shadow-soft transition hover:scale-105', className)}>
      <Heart className={cx('h-[18px] w-[18px]', active && 'fill-burgundy text-burgundy')} aria-hidden />
    </button>
  );
}

export function SalonCard({ salon, priority }: { salon: Salon; priority?: boolean }) {
  const rating = Number(salon.avgRating);
  const kind = salon.categories.some((c) => /nail|manicure|pedicure|acrylic/i.test(c.slug)) && !salon.categories.some((c) => /hair|braid/i.test(c.slug)) ? 'nails' : 'hair';
  return (
    <article className="group relative">
      <Link to={`/salons/${salon.slug}`} className="block rounded-3xl focus-visible:outline-offset-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-arch bg-plum">
          {salon.image
            ? <img src={salon.image} alt={`${salon.name} salon`} loading={priority ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            : <ArchArt kind={kind} seed={salon.name.length} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" />}
          <div className="absolute bottom-8 left-3 flex flex-col items-start gap-1.5">
            {salon.isDemo && <Badge tone="gold" className="bg-ivory/95">Demo listing</Badge>}
            {salon.isVerified && <Badge tone="ok" className="bg-ivory/95"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Verified</Badge>}
          </div>
        </div>
        <div className="px-1 pt-3.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl leading-snug">{salon.name}</h3>
            <p className="shrink-0 pt-1 text-sm font-semibold text-plum">{salon.reviewCount > 0 ? <><span aria-hidden>★</span> {rating.toFixed(1)} <span className="font-normal text-ink-soft">({salon.reviewCount})</span></> : <span className="font-normal text-ink-soft">New</span>}</p>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5" aria-hidden />{salon.neighborhood}, {salon.city}</p>
          <p className="mt-1 text-sm text-ink-soft">{salon.minPriceEtb ? <>From <span className="font-semibold text-ink">{money(salon.minPriceEtb)}</span></> : 'Prices on request'}{salon.bookingMode === 'APPROVAL' && ' · Needs salon approval'}</p>
        </div>
      </Link>
      <FavoriteButton salonId={salon.id} active={salon.isFavorite} className="absolute right-3 top-4" />
    </article>
  );
}

export function SalonCardSkeleton() {
  return <div><div className="skeleton aspect-[4/5] rounded-arch" /><div className="skeleton mt-4 h-5 w-3/4" /><div className="skeleton mt-2 h-4 w-1/2" /></div>;
}
