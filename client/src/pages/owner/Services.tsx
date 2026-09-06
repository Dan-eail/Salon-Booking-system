import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Confirm, Empty, ErrorState, FormError, Input, Modal, PageTitle, Select, Skeleton, Switch, Textarea } from '@/components/ui';
import { del, get, patch, post } from '@/lib/api';
import { duration, fromLocalInput, money, toLocalInput } from '@/lib/format';
import { useMeta } from '@/hooks/queries';
import type { OwnerService, OwnerStaff } from '@/lib/types';
import { useSalon } from './context';
import { fieldMsg } from './util';

type Form = { name: string; description: string; categoryId: string; priceEtb: string; durationMinutes: string; bufferMinutes: string; promo: boolean; promoPriceEtb: string; promoStartsAt: string; promoEndsAt: string; isActive: boolean; staffIds: string[] };
const blank: Form = { name: '', description: '', categoryId: '', priceEtb: '', durationMinutes: '60', bufferMinutes: '0', promo: false, promoPriceEtb: '', promoStartsAt: '', promoEndsAt: '', isActive: true, staffIds: [] };
const fromService = (s: OwnerService): Form => ({
  name: s.name, description: s.description, categoryId: s.categoryId, priceEtb: s.priceEtb, durationMinutes: String(s.durationMinutes), bufferMinutes: String(s.bufferMinutes),
  promo: !!s.promoPriceEtb, promoPriceEtb: s.promoPriceEtb ?? '', promoStartsAt: s.promoStartsAt ? toLocalInput(s.promoStartsAt) : '', promoEndsAt: s.promoEndsAt ? toLocalInput(s.promoEndsAt) : '', isActive: s.isActive, staffIds: s.staffIds,
});

function Editor({ existing, staff, onClose }: { existing: OwnerService | null; staff: OwnerStaff[]; onClose: () => void }) {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const meta = useMeta();
  const [f, setF] = useState<Form>(existing ? fromService(existing) : blank);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, description: f.description, categoryId: f.categoryId, priceEtb: f.priceEtb, durationMinutes: Number(f.durationMinutes), bufferMinutes: Number(f.bufferMinutes), isActive: f.isActive, staffIds: f.staffIds,
        promoPriceEtb: f.promo ? f.promoPriceEtb || null : null, promoStartsAt: f.promo && f.promoStartsAt ? fromLocalInput(f.promoStartsAt) : null, promoEndsAt: f.promo && f.promoEndsAt ? fromLocalInput(f.promoEndsAt) : null,
      };
      return existing ? patch(`${base}/services/${existing.id}`, body) : post(`${base}/services`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['owner', salon.id] }); onClose(); },
  });
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit service' : 'New service'} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} error={err('name')} placeholder="e.g. Silk press and trim" />
        <Select label="Category" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={err('categoryId')}>
          <option value="">Choose…</option>
          {(meta.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Textarea label="Description" optional rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={600} error={err('description')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Price (Br)" inputMode="decimal" value={f.priceEtb} onChange={(e) => set('priceEtb', e.target.value)} error={err('priceEtb')} />
          <Input label="Duration (min)" type="number" min={5} step={5} value={f.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} error={err('durationMinutes')} />
          <Input label="Buffer after (min)" type="number" min={0} step={5} value={f.bufferMinutes} onChange={(e) => set('bufferMinutes', e.target.value)} hint="Clean-up time." error={err('bufferMinutes')} />
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <Switch label="Offer a promotional price" checked={f.promo} onCheckedChange={(v) => set('promo', v)} />
          {f.promo && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Input label="Promo price (Br)" inputMode="decimal" value={f.promoPriceEtb} onChange={(e) => set('promoPriceEtb', e.target.value)} error={err('promoPriceEtb')} />
              <Input label="Starts" type="datetime-local" value={f.promoStartsAt} onChange={(e) => set('promoStartsAt', e.target.value)} error={err('promoStartsAt')} />
              <Input label="Ends" type="datetime-local" value={f.promoEndsAt} onChange={(e) => set('promoEndsAt', e.target.value)} error={err('promoEndsAt')} />
            </div>
          )}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-plum">Who can do this service</legend>
          {staff.length === 0 ? <p className="text-sm text-ink-soft">Add staff first, then assign them here. Customers can only book services that have at least one staff member.</p> : (
            <div className="flex flex-wrap gap-2">
              {staff.filter((s) => s.isActive).map((s) => {
                const on = f.staffIds.includes(s.id);
                return <label key={s.id} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium ${on ? 'border-plum bg-plum text-ivory' : 'border-line bg-white'}`}><input type="checkbox" className="sr-only" checked={on} onChange={() => set('staffIds', on ? f.staffIds.filter((x) => x !== s.id) : [...f.staffIds, s.id])} />{s.displayName}</label>;
              })}
            </div>
          )}
        </fieldset>
        <Switch label={f.isActive ? 'Published: customers can book it' : 'Unpublished: hidden from customers'} checked={f.isActive} onCheckedChange={(v) => set('isActive', v)} />
        <FormError error={m.error} />
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={m.isPending}>{existing ? 'Save changes' : 'Add service'}</Button></div>
      </form>
    </Modal>
  );
}

export default function Services() {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['owner', salon.id, 'services'], queryFn: () => get<OwnerService[]>(`${base}/services`) });
  const staff = useQuery({ queryKey: ['owner', salon.id, 'staff'], queryFn: () => get<OwnerStaff[]>(`${base}/staff`) });
  const [edit, setEdit] = useState<OwnerService | 'new' | null>(null);
  const [remove, setRemove] = useState<OwnerService | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ['owner', salon.id] });
  const toggle = useMutation({ mutationFn: (s: OwnerService) => patch(`${base}/services/${s.id}`, { isActive: !s.isActive }), onSuccess: done });
  const rm = useMutation({ mutationFn: (s: OwnerService) => del<{ deleted: boolean; message?: string }>(`${base}/services/${s.id}`), onSuccess: () => { setRemove(null); void done(); } });
  const list = q.data ?? [];
  return (
    <>
      <PageTitle title="Services" sub="What customers can book, and for how much." action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add service</Button>} />
      {q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : q.isLoading ? <Skeleton className="h-64 w-full" /> : list.length === 0 ? (
        <Empty title="No services yet" body="Add the treatments you offer. Customers see them, with prices and durations, on your salon page." action={<Button onClick={() => setEdit('new')}>Add your first service</Button>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {list.map((s) => {
            const promoLive = s.promoPriceEtb && s.promoEndsAt && new Date(s.promoEndsAt) > new Date();
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                {s.imageUrl && (
                  <img src={s.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-xs" />
                )}
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-semibold">{s.name} {!s.isActive && <Badge className="ml-1">Unpublished</Badge>}{s.staffIds.length === 0 && <Badge tone="warn" className="ml-1">No staff assigned</Badge>}</p>
                  <p className="text-sm text-ink-soft">{s.category.name} · {duration(s.durationMinutes)}{s.bufferMinutes ? ` + ${s.bufferMinutes} min buffer` : ''} · {s.bookingCount} booking{s.bookingCount === 1 ? '' : 's'}</p>
                </div>
                <p className="text-right font-semibold text-plum">{promoLive ? <><span className="mr-2 text-sm font-normal text-ink-soft line-through">{money(s.priceEtb)}</span>{money(s.promoPriceEtb!)}</> : money(s.priceEtb)}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === s.id} onClick={() => toggle.mutate(s)}>{s.isActive ? 'Unpublish' : 'Publish'}</Button>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => setEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => setRemove(s)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {toggle.isError && <div className="mt-3"><FormError error={toggle.error} /></div>}
      {edit && <Editor existing={edit === 'new' ? null : edit} staff={staff.data ?? []} onClose={() => setEdit(null)} />}
      <Confirm open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={`Delete ${remove?.name ?? ''}?`} confirmLabel="Delete service" loading={rm.isPending} error={rm.error}
        body={remove && remove.bookingCount > 0 ? 'This service has bookings, so it will be unpublished instead of deleted. Past appointments keep their details.' : 'This removes the service for good.'} onConfirm={() => remove && rm.mutate(remove)} />
    </>
  );
}
