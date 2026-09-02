import { ApiError } from '@/lib/api';

/** Message for one field from a server validation error (`details` paths like "body.priceEtb" or "priceEtb"). */
export const fieldMsg = (error: unknown, name: string): string | undefined => {
  if (!(error instanceof ApiError)) return undefined;
  return error.fields.find((f) => f.path === name || f.path.endsWith(`.${name}`))?.message;
};

/** Error message to show above a form when it is not attached to a specific field. */
export const hasFieldErrors = (error: unknown) => error instanceof ApiError && error.fields.length > 0;

export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const monthEnd = (d: string) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const weekStart = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
