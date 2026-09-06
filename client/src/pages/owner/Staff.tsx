import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorState, FormError, Input, Modal, PageTitle, Skeleton, Switch, Textarea } from '@/components/ui';
import { del, get, patch, post, put } from '@/lib/api';
import { dayName, fmtDateTime, fromLocalInput, inputToMinutes, minutesToInput, minutesToLabel } from '@/lib/format';
import type { OwnerService, OwnerStaff } from '@/lib/types';
import { useSalon } from './context';
import { fieldMsg } from './util';

const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Monday first

/* ------------------------------------------------------------------ Profile editor */
function Editor({ existing, services, onClose }: { existing: OwnerStaff | null; services: OwnerService[]; onClose: () => void }) {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const [f, setF] = useState({ displayName: existing?.displayName ?? '', title: existing?.title ?? '', bio: existing?.bio ?? '', specialties: (existing?.specialties ?? []).join(', '), serviceIds: existing?.serviceIds ?? [] as string[] });
  const [login, setLogin] = useState(false);
  const [acct, setAcct] = useState({ email: '', phone: '', password: '' });
  const m = useMutation({
    mutationFn: () => {
      const body = { displayName: f.displayName, title: f.title.trim() || null, bio: f.bio.trim() || null, specialties: f.specialties.split(',').map((s) => s.trim()).filter(Boolean), serviceIds: f.serviceIds };
      return existing ? patch(`${base}/staff/${existing.id}`, body) : post(`${base}/staff`, { ...body, ...(login ? { account: acct } : {}) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['owner', salon.id] }); onClose(); },
  });
  const err = (n: string) => fieldMsg(m.error, n);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={existing ? `Edit ${existing.displayName}` : 'Add a staff member'} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name shown to customers" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} error={err('displayName')} />
          <Input label="Role" optional placeholder="e.g. Senior stylist" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={err('title')} />
        </div>
        <Textarea label="Short bio" optional rows={2} maxLength={500} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <Input label="Specialties" optional hint="Separate with commas, e.g. Braids, Natural hair" value={f.specialties} onChange={(e) => setF({ ...f, specialties: e.target.value })} error={err('specialties')} />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-plum">Services they perform</legend>
          {services.length === 0 ? <p className="text-sm text-ink-soft">Add services first, then assign them.</p> : (
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const on = f.serviceIds.includes(s.id);
                return <label key={s.id} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium ${on ? 'border-plum bg-plum text-ivory' : 'border-line bg-white'}`}><input type="checkbox" className="sr-only" checked={on} onChange={() => setF({ ...f, serviceIds: on ? f.serviceIds.filter((x) => x !== s.id) : [...f.serviceIds, s.id] })} />{s.name}</label>;
              })}
            </div>
          )}
        </fieldset>
        {!existing && (
          <div className="rounded-2xl border border-line bg-white p-4">
            <Switch label="Give them a sign-in so they can see their own diary" checked={login} onCheckedChange={setLogin} />
            {login && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input label="Email" type="email" value={acct.email} onChange={(e) => setAcct({ ...acct, email: e.target.value })} error={err('email')} />
                <Input label="Phone" inputMode="tel" value={acct.phone} onChange={(e) => setAcct({ ...acct, phone: e.target.value })} error={err('phone')} />
                <Input label="Temporary password" type="text" wrapperClass="sm:col-span-2" hint="At least 8 characters with letters and numbers. Share it with them privately." value={acct.password} onChange={(e) => setAcct({ ...acct, password: e.target.value })} error={err('password')} autoComplete="off" />
              </div>
            )}
          </div>
        )}
        <FormError error={m.error} />
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={m.isPending}>{existing ? 'Save changes' : 'Add staff member'}</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Schedule + time off */
type Win = { startMinutes: number; endMinutes: number; label?: string };
function WindowRows({ wins, onChange, labelled }: { wins: Win[]; onChange: (w: Win[]) => void; labelled?: boolean }) {
  return (
    <div className="space-y-2">
      {wins.map((w, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input aria-label="Start" type="time" className="h-10 rounded-lg border bg-white px-2 text-sm" value={minutesToInput(w.startMinutes)} onChange={(e) => onChange(wins.map((x, j) => j === i ? { ...x, startMinutes: inputToMinutes(e.target.value) } : x))} />
          <span aria-hidden>–</span>
          <input aria-label="End" type="time" className="h-10 rounded-lg border bg-white px-2 text-sm" value={minutesToInput(w.endMinutes)} onChange={(e) => onChange(wins.map((x, j) => j === i ? { ...x, endMinutes: inputToMinutes(e.target.value) } : x))} />
          {labelled && <input aria-label="Label" className="h-10 w-28 rounded-lg border bg-white px-2 text-sm" value={w.label ?? ''} placeholder="Break" onChange={(e) => onChange(wins.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />}
          <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(wins.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </div>
  );
}

function Schedule({ staff, onClose }: { staff: OwnerStaff; onClose: () => void }) {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const [shifts, setShifts] = useState(() => staff.schedules.map(({ dayOfWeek, startMinutes, endMinutes }) => ({ dayOfWeek, startMinutes, endMinutes })));
  const [breaks, setBreaks] = useState(() => staff.breaks.map(({ dayOfWeek, startMinutes, endMinutes, label }) => ({ dayOfWeek, startMinutes, endMinutes, label })));
  const [off, setOff] = useState({ startAt: '', endAt: '', reason: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['owner', salon.id] });
  const save = useMutation({ mutationFn: () => put(`${base}/staff/${staff.id}/schedule`, { schedules: shifts, breaks }), onSuccess: () => { void refresh(); onClose(); } });
  const addOff = useMutation({ mutationFn: () => post<{ conflictingAppointments: number }>(`${base}/staff/${staff.id}/time-off`, { startAt: fromLocalInput(off.startAt), endAt: fromLocalInput(off.endAt), reason: off.reason || null }), onSuccess: () => { setOff({ startAt: '', endAt: '', reason: '' }); void refresh(); } });
  const rmOff = useMutation({ mutationFn: (id: string) => del(`${base}/staff/${staff.id}/time-off/${id}`), onSuccess: () => void refresh() });
  const current = useQuery({ queryKey: ['owner', salon.id, 'staff'], queryFn: () => get<OwnerStaff[]>(`${base}/staff`) });
  const timeOff = current.data?.find((s) => s.id === staff.id)?.timeOff ?? staff.timeOff;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${staff.displayName}'s hours`} description="Customers can only book inside these times." wide>
      <div className="space-y-4">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {DAYS.map((d) => {
            const day = shifts.filter((s) => s.dayOfWeek === d); const br = breaks.filter((b) => b.dayOfWeek === d);
            return (
              <li key={d} className="grid gap-3 p-3 sm:grid-cols-[110px_1fr]">
                <div><p className="font-semibold">{dayName(d)}</p>{day.length === 0 && <p className="text-sm text-ink-soft">Off</p>}</div>
                <div className="space-y-2">
                  <WindowRows wins={day} onChange={(w) => setShifts([...shifts.filter((s) => s.dayOfWeek !== d), ...w.map((x) => ({ dayOfWeek: d, startMinutes: x.startMinutes, endMinutes: x.endMinutes }))])} />
                  {br.length > 0 && <div><p className="mb-1 text-xs font-semibold text-ink-soft">Breaks</p><WindowRows labelled wins={br} onChange={(w) => setBreaks([...breaks.filter((b) => b.dayOfWeek !== d), ...w.map((x) => ({ dayOfWeek: d, startMinutes: x.startMinutes, endMinutes: x.endMinutes, label: x.label || 'Break' }))])} /></div>}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setShifts([...shifts, { dayOfWeek: d, startMinutes: day.length ? Math.min(day[day.length - 1].endMinutes + 60, 1380) : 540, endMinutes: day.length ? Math.min(day[day.length - 1].endMinutes + 180, 1439) : 1020 }])}>{day.length ? 'Add shift' : 'Add hours'}</Button>
                    {day.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setBreaks([...breaks, { dayOfWeek: d, startMinutes: 780, endMinutes: 840, label: 'Lunch' }])}>Add break</Button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <FormError error={save.error} />
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Close</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save hours</Button></div>

        <section className="border-t border-line pt-4">
          <h3 className="font-display text-xl text-plum">Time off</h3>
          {timeOff.length > 0 && <ul className="mt-2 space-y-1.5">{timeOff.map((t) => <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"><span>{fmtDateTime(t.startAt)} → {fmtDateTime(t.endAt)}{t.reason ? ` · ${t.reason}` : ''}</span><Button variant="ghost" size="icon" aria-label="Remove time off" onClick={() => rmOff.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>}
          <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); addOff.mutate(); }}>
            <Input label="From" type="datetime-local" value={off.startAt} onChange={(e) => setOff({ ...off, startAt: e.target.value })} />
            <Input label="Until" type="datetime-local" value={off.endAt} onChange={(e) => setOff({ ...off, endAt: e.target.value })} error={fieldMsg(addOff.error, 'endAt')} />
            <Input label="Reason" optional value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} />
            <Button type="submit" loading={addOff.isPending} disabled={!off.startAt || !off.endAt}>Add</Button>
          </form>
          {addOff.data && addOff.data.conflictingAppointments > 0 && <p role="status" className="mt-2 rounded-xl bg-warn/10 px-4 py-3 text-sm">{addOff.data.conflictingAppointments} existing appointment{addOff.data.conflictingAppointments === 1 ? '' : 's'} fall in this time. They are not cancelled automatically, so please contact those customers.</p>}
          <FormError error={addOff.isError && !fieldMsg(addOff.error, 'endAt') ? addOff.error : rmOff.error} />
        </section>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Page */
export default function StaffPage() {
  const { salon, base } = useSalon();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['owner', salon.id, 'staff'], queryFn: () => get<OwnerStaff[]>(`${base}/staff`) });
  const services = useQuery({ queryKey: ['owner', salon.id, 'services'], queryFn: () => get<OwnerService[]>(`${base}/services`) });
  const [edit, setEdit] = useState<OwnerStaff | 'new' | null>(null);
  const [sched, setSched] = useState<OwnerStaff | null>(null);
  const toggle = useMutation({ mutationFn: (s: OwnerStaff) => patch(`${base}/staff/${s.id}`, { isActive: !s.isActive }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['owner', salon.id] }) });
  const list = q.data ?? [];
  return (
    <>
      <PageTitle title="Staff" sub="The people customers can book with." action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add staff member</Button>} />
      {q.isError ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : q.isLoading ? <Skeleton className="h-64 w-full" /> : list.length === 0 ? (
        <Empty title="No staff yet" body="Add yourself and your team. Each person has their own working hours and the services they perform." action={<Button onClick={() => setEdit('new')}>Add a staff member</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((s) => (
            <Card key={s.id} className={s.isActive ? '' : 'opacity-75'}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-arch bg-plum font-display text-lg text-ivory shadow-xs">
                    {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="h-full w-full object-cover" /> : s.displayName[0]}
                  </span>
                  <div className="min-w-0"><h2 className="truncate text-xl font-semibold text-plum">{s.displayName}</h2><p className="text-sm text-ink-soft">{s.title || 'Staff'}</p></div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">{!s.isActive && <Badge>Inactive</Badge>}{s.loginEmail && <Badge tone="plum">Has sign-in</Badge>}</div>
              </div>
              <p className="mt-3 text-sm text-ink-soft">{s.serviceIds.length} service{s.serviceIds.length === 1 ? '' : 's'} · {s.schedules.length ? `${new Set(s.schedules.map((x) => x.dayOfWeek)).size} working days` : 'No working hours set'}{s.schedules[0] ? ` · e.g. ${dayName(s.schedules[0].dayOfWeek).slice(0, 3)} ${minutesToLabel(s.schedules[0].startMinutes)}–${minutesToLabel(s.schedules[0].endMinutes)}` : ''}</p>
              {s.isActive && s.schedules.length === 0 && <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-sm">Not bookable until you set working hours.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setSched(s)}><CalendarClock className="h-4 w-4" />Hours and time off</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" />Edit</Button>
                <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === s.id} onClick={() => toggle.mutate(s)}><UserX className="h-4 w-4" />{s.isActive ? 'Deactivate' : 'Reactivate'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {toggle.isError && <div className="mt-3"><FormError error={toggle.error} /></div>}
      {edit && <Editor existing={edit === 'new' ? null : edit} services={(services.data ?? []).filter((s) => s.isActive || (edit !== 'new' && edit.serviceIds.includes(s.id)))} onClose={() => setEdit(null)} />}
      {sched && <Schedule staff={sched} onClose={() => setSched(null)} />}
    </>
  );
}
