import * as Dialog from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Star, X } from 'lucide-react';
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import type { AppointmentStatus } from '@/lib/types';

/* ------------------------------------------------------------------ Button */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background,box-shadow,transform,color] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-burgundy text-ivory shadow-soft hover:bg-burgundy-dark',
        plum: 'bg-plum text-ivory hover:bg-plum-soft',
        outline: 'border border-plum/30 bg-transparent text-plum hover:border-plum hover:bg-plum/5',
        soft: 'bg-blush text-plum hover:bg-blush/70',
        ghost: 'text-plum hover:bg-plum/[0.08]',
        danger: 'bg-danger text-white hover:brightness-90',
        dangerOutline: 'border border-danger/40 text-danger hover:bg-danger/5',
      },
      size: { sm: 'h-9 px-4 text-sm', md: 'h-11 px-6 text-[15px]', lg: 'h-14 px-8 text-base', icon: 'h-10 w-10' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ className, variant, size, loading, disabled, children, ...p }, ref) => (
  <button ref={ref} type="button" className={cx(button({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';
export const ButtonLink = ({ className, variant, size, ...p }: LinkProps & VariantProps<typeof button>) => <Link className={cx(button({ variant, size }), className)} {...p} />;

/* ------------------------------------------------------------------ Fields */
const control = 'w-full rounded-xl border bg-white px-4 text-[15px] text-ink placeholder:text-ink-soft/60 transition-colors focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-burgundy/20 disabled:bg-ivory-deep disabled:text-ink-soft';
type FieldShell = { label: string; error?: string; hint?: string; className?: string; optional?: boolean; wrapperClass?: string };

function Shell({ label, error, hint, optional, className, id, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-plum">
        {label}{optional && <span className="ml-1.5 font-normal text-ink-soft">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-[13px] text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-[13px] font-medium text-danger">{error}</p>}
    </div>
  );
}
const aria = (id: string, error?: string, hint?: string) => ({ 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined });

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShell>(({ label, error, hint, optional, className, wrapperClass, ...p }, ref) => {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} optional={optional} className={wrapperClass}>
      <input id={id} ref={ref} className={cx(control, 'h-12', error ? 'border-danger' : 'border-line', className)} {...aria(id, error, hint)} {...p} />
    </Shell>
  );
});
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(({ label, error, hint, optional, className, ...p }, ref) => {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} optional={optional}>
      <textarea id={id} ref={ref} rows={3} className={cx(control, 'py-3', error ? 'border-danger' : 'border-line', className)} {...aria(id, error, hint)} {...p} />
    </Shell>
  );
});
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldShell>(({ label, error, hint, optional, className, children, ...p }, ref) => {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} optional={optional}>
      <select id={id} ref={ref} className={cx(control, 'h-12 appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%237a2142%22><path d=%22M5 7l5 6 5-6z%22/></svg>")] bg-[length:18px] bg-[right_14px_center] bg-no-repeat pr-10', error ? 'border-danger' : 'border-line', className)} {...aria(id, error, hint)} {...p}>
        {children}
      </select>
    </Shell>
  );
});
Select.displayName = 'Select';

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
        className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-burgundy disabled:opacity-50">
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
    </div>
  );
}

/* ---------------------------------------------------------------- Feedback */
const badge = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: { tone: { neutral: 'bg-ivory-deep text-ink-soft', ok: 'bg-ok/[0.12] text-ok', warn: 'bg-warn/[0.14] text-warn', danger: 'bg-danger/10 text-danger', plum: 'bg-plum text-ivory', gold: 'bg-gold/[0.18] text-gold-ink' } },
  defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ tone, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) => <span className={cx(badge({ tone }), className)} {...p} />;

const statusMap: Record<AppointmentStatus, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'plum' }> = {
  PENDING: { label: 'Awaiting approval', tone: 'warn' }, CONFIRMED: { label: 'Confirmed', tone: 'ok' }, REJECTED: { label: 'Declined', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' }, COMPLETED: { label: 'Completed', tone: 'plum' }, NO_SHOW: { label: 'No-show', tone: 'danger' },
};
export const StatusBadge = ({ status }: { status: AppointmentStatus }) => <Badge tone={statusMap[status].tone}>{statusMap[status].label}</Badge>;

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} aria-hidden />;
export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-12 text-ink-soft"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /><span>{label}…</span></div>
);

export function Empty({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-arch border border-dashed border-plum/25 bg-blush-soft/50 px-8 pb-10 pt-12 text-center">
      {icon && <div className="mb-3 text-burgundy">{icon}</div>}
      <h3 className="text-xl">{title}</h3>
      {body && <p className="mt-2 text-[15px] text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-8 text-center">
      <AlertTriangle className="h-7 w-7 text-danger" aria-hidden />
      <p className="font-medium text-ink">{msg}</p>
      {retry && <Button variant="outline" size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

export const FormError = ({ error }: { error: unknown }) =>
  error ? <p role="alert" className="rounded-xl bg-danger/[0.08] px-4 py-3 text-sm font-medium text-danger">{error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'}</p> : null;

/* ------------------------------------------------------------------ Dialog */
export function Modal({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-plum/55 backdrop-blur-[2px] data-[state=open]:animate-[rise_.2s_ease-out]" />
        <Dialog.Content className={cx('fixed z-50 max-h-[92dvh] overflow-y-auto bg-ivory p-6 shadow-lift focus:outline-none',
          'inset-x-0 bottom-0 rounded-t-3xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-2xl font-medium text-plum">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-ink-soft">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-5 w-5" /></Button></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation for destructive actions. */
export function Confirm({ open, onOpenChange, title, body, confirmLabel, onConfirm, loading, error }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; confirmLabel: string; onConfirm: () => void; loading?: boolean; error?: unknown }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <p className="text-[15px] text-ink-soft">{body}</p>
      <div className="mt-4"><FormError error={error} /></div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Keep it</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- Rating etc */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} width={size} height={size} className={n <= Math.round(value) ? 'fill-gold text-gold' : 'text-line'} aria-hidden />)}
    </span>
  );
}
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="rounded p-1">
          <Star className={cx('h-8 w-8 transition-colors', n <= value ? 'fill-gold text-gold' : 'text-line hover:text-gold/60')} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
      <span className="text-sm text-ink-soft">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
    </nav>
  );
}

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cx('rounded-2xl border border-line bg-white p-5 shadow-soft', className)} {...p} />;
export const PageTitle = ({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-3xl sm:text-4xl">{title}</h1>{sub && <p className="mt-1.5 max-w-prose text-[15px] text-ink-soft">{sub}</p>}</div>
    {action}
  </div>
);
export const Tick = () => <Check className="h-4 w-4 text-ok" aria-hidden />;

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-ivory-deep p-1">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cx('rounded-full px-4 py-1.5 text-sm font-semibold transition-colors', value === i.value ? 'bg-plum text-ivory shadow-soft' : 'text-ink-soft hover:text-plum')}>{i.label}</button>
      ))}
    </div>
  );
}
