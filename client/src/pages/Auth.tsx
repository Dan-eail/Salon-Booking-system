import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { normalizePhone } from '@shared/phone';
import { Tilet } from '@/components/Art';
import { Button, FormError, Input, Select } from '@/components/ui';
import { useMeta } from '@/hooks/queries';
import { ApiError, post } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { cx } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';

function Frame({ title, sub, children, footer }: { title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[70dvh] items-center py-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-4xl sm:text-5xl">{title}</h1>{sub && <p className="mt-3 text-ink-soft">{sub}</p>}
        <div className="mt-8">{children}</div>{footer && <div className="mt-6 text-[15px] text-ink-soft">{footer}</div>}
      </div>
      <div className="relative hidden h-[34rem] overflow-hidden rounded-arch bg-plum lg:block" aria-hidden>
        <div className="absolute inset-x-0 top-0"><Tilet /></div>
        <svg viewBox="0 0 400 560" className="h-full w-full"><g fill="none" stroke="#E2BC72" strokeLinecap="round">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <path key={i} d={`M${50 + i * 43} 70 C ${80 + i * 43} 190, ${20 + i * 43} 320, ${50 + i * 43} 440 S ${64 + i * 43} 540, ${50 + i * 43} 600`} strokeWidth={i % 2 ? 6 : 12} opacity={i % 2 ? 0.45 : 0.8} />)}</g><circle cx="200" cy="120" r="70" fill="#F1D6D3" opacity=".12" /></svg>
        <p className="absolute inset-x-8 bottom-10 font-display text-3xl leading-snug text-ivory">Good hair days start with a booking that just works.</p>
      </div>
    </div>
  );
}

const useAfterAuth = () => { const { state } = useLocation(); return (state as { from?: string } | null)?.from; };
const serverFields = (e: unknown) => (e instanceof ApiError ? Object.fromEntries(e.fields.map((f) => [f.path, f.message])) : {});

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const from = useAfterAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string; password: string }>({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') })) });
  const m = useMutation({ mutationFn: (v: { email: string; password: string }) => login(v.email, v.password), onSuccess: (u) => navigate(from ?? homeFor(u), { replace: true }) });
  if (user && !m.isPending) return <Navigate to={from ?? homeFor(user)} replace />;
  return (
    <Frame title="Welcome back" sub="Sign in to manage your bookings." footer={<>New here? <Link to="/register" state={{ from }} className="font-semibold text-burgundy hover:underline">Create an account</Link></>}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate className="space-y-4">
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <FormError error={m.error} />
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Sign in</Button>
        <p className="text-center text-sm"><Link to="/forgot-password" className="font-semibold text-burgundy hover:underline">Forgot your password?</Link></p>
      </form>
    </Frame>
  );
}

const regSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().refine((v) => !!normalizePhone(v), 'Enter a valid phone number, e.g. 0911 234 567'),
  password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
  salonName: z.string().trim().optional(), neighborhood: z.string().optional(), address: z.string().trim().optional(),
});
type Reg = z.infer<typeof regSchema>;

export function Register() {
  const [sp] = useSearchParams();
  const { register: signUp, user } = useAuth();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const from = useAfterAuth();
  const [owner, setOwner] = useState(sp.get('type') === 'owner');
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Reg>({ resolver: zodResolver(regSchema) });
  const m = useMutation({
    mutationFn: (v: Reg) => signUp({ ...v, role: owner ? 'OWNER' : 'CUSTOMER' }),
    onSuccess: (u) => { toast.success(owner ? 'Account created. Set up your salon next.' : 'Welcome to Belle Ethiopia'); navigate(from ?? (u.role === 'OWNER' ? '/salon' : '/dashboard'), { replace: true }); },
    onError: (e) => { for (const [k, v] of Object.entries(serverFields(e))) setError(k as keyof Reg, { message: v }); },
  });
  const submit = (v: Reg) => {
    if (owner) {
      let bad = false;
      for (const k of ['salonName', 'neighborhood', 'address'] as const) if (!v[k]) { setError(k, { message: 'Required for salons' }); bad = true; }
      if (bad) return;
    }
    m.mutate(v);
  };
  if (user && !m.isPending && !m.isSuccess) return <Navigate to="/" replace />;
  return (
    <Frame title={owner ? 'List your salon' : 'Create your account'} sub={owner ? 'Set up in minutes. Your salon goes live after a quick review.' : 'Book faster and keep all your appointments in one place.'}
      footer={<>Already registered? <Link to="/login" state={{ from }} className="font-semibold text-burgundy hover:underline">Sign in</Link></>}>
      <div className="mb-5 inline-flex rounded-full bg-ivory-deep p-1" role="tablist" aria-label="Account type">
        {[{ v: false, l: 'I’m a customer' }, { v: true, l: 'I own a salon' }].map((o) => <button key={o.l} role="tab" type="button" aria-selected={owner === o.v} onClick={() => setOwner(o.v)} className={cx('rounded-full px-4 py-1.5 text-sm font-semibold', owner === o.v ? 'bg-plum text-ivory' : 'text-ink-soft')}>{o.l}</button>)}
      </div>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Input label="Full name" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input label="Phone number" type="tel" inputMode="tel" autoComplete="tel" hint="Ethiopian numbers work as 0911…, +251 911… or 911…" error={errors.phone?.message} {...register('phone')} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number" error={errors.password?.message} {...register('password')} />
        {owner && <>
          <Input label="Salon name" error={errors.salonName?.message} {...register('salonName')} />
          <Select label="Area" error={errors.neighborhood?.message} {...register('neighborhood')}><option value="">Choose an area</option>{meta?.locations.map((l) => <option key={l.id} value={l.neighborhood}>{l.neighborhood}</option>)}</Select>
          <Input label="Street address or landmark" error={errors.address?.message} {...register('address')} />
        </>}
        <FormError error={m.error && Object.keys(serverFields(m.error)).length === 0 ? m.error : null} />
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>{owner ? 'Create salon account' : 'Create account'}</Button>
      </form>
    </Frame>
  );
}

export function ForgotPassword() {
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email address') })) });
  const m = useMutation({ mutationFn: (v: { email: string }) => post<{ message: string; devOnlyResetToken?: string }>('/auth/forgot-password', v) });
  return (
    <Frame title="Reset your password" sub="Enter your email and we’ll send a reset link if the account exists." footer={<Link to="/login" className="font-semibold text-burgundy hover:underline">Back to sign in</Link>}>
      {m.data ? (
        <div className="space-y-3 rounded-2xl bg-blush-soft p-5"><p className="font-semibold text-plum">{m.data.message}</p>
          {m.data.devOnlyResetToken && <p className="text-sm">Email isn’t configured on this server, so for local development only: <Link className="font-semibold text-burgundy underline" to={`/reset-password?token=${m.data.devOnlyResetToken}`}>open the reset page</Link>.</p>}</div>
      ) : (
        <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate className="space-y-4"><Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} /><FormError error={m.error} /><Button type="submit" size="lg" className="w-full" loading={m.isPending}>Send reset link</Button></form>
      )}
    </Frame>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm<{ newPassword: string }>({ resolver: zodResolver(z.object({ newPassword: regSchema.shape.password })) });
  const m = useMutation({ mutationFn: (v: { newPassword: string }) => post('/auth/reset-password', { token: sp.get('token'), ...v }), onSuccess: () => { toast.success('Password updated. Sign in with your new password.'); navigate('/login'); } });
  if (!sp.get('token')) return <Frame title="Link not valid" sub="This reset link is missing its token. Request a new one."><Link to="/forgot-password" className="font-semibold text-burgundy underline">Request a new link</Link></Frame>;
  return (
    <Frame title="Choose a new password">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate className="space-y-4"><Input label="New password" type="password" autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword')} /><FormError error={m.error} /><Button type="submit" size="lg" className="w-full" loading={m.isPending}>Update password</Button></form>
    </Frame>
  );
}
