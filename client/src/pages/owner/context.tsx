import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { get } from '@/lib/api';
import type { OwnerSalon } from '@/lib/types';

type Ctx = { salon: OwnerSalon; salons: OwnerSalon[]; select: (id: string) => void; isOwner: boolean; base: string };
const C = createContext<Ctx | null>(null);
export const useSalon = () => { const c = useContext(C); if (!c) throw new Error('useSalon outside SalonProvider'); return c; };

export function SalonProvider({ children, fallback }: { children: (state: { loading: boolean; error: unknown; empty: boolean }) => ReactNode; fallback?: never }) {
  void fallback;
  const q = useQuery({ queryKey: ['owner', 'salons'], queryFn: () => get<OwnerSalon[]>('/owner/salons') });
  const [id, setId] = useState<string>(() => { try { return localStorage.getItem('belle.salon') ?? ''; } catch { return ''; } });
  const salons = q.data ?? [];
  const salon = salons.find((s) => s.id === id) ?? salons[0];
  useEffect(() => { if (salon) try { localStorage.setItem('belle.salon', salon.id); } catch { /* ignore */ } }, [salon]);
  if (!salon) return <>{children({ loading: q.isLoading, error: q.error, empty: q.isSuccess && salons.length === 0 })}</>;
  return <C.Provider value={{ salon, salons, select: setId, isOwner: salon.level === 'owner', base: `/owner/salons/${salon.id}` }}>{children({ loading: false, error: null, empty: false })}</C.Provider>;
}
