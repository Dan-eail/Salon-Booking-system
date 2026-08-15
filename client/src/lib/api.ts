export type Meta = { page: number; pageSize: number; total: number; totalPages: number; [k: string]: unknown };
export type FieldIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: FieldIssue[] = []) {
    super(message);
  }
}

const BASE = '/api/v1';
let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const onSessionLost = (fn: () => void) => { onAuthLost = fn; };

type Opts = { method?: string; body?: unknown; query?: Record<string, unknown>; form?: FormData; auth?: boolean; signal?: AbortSignal };

function qs(query?: Record<string, unknown>) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

let refreshing: Promise<boolean> | null = null;
/** Single-flight refresh: concurrent 401s share one rotation so the token family is not revoked by a race. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'belle' } })
    .then(async (r) => {
      if (!r.ok) return false;
      const json = await r.json();
      accessToken = json.data.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function send(path: string, o: Opts, retried = false): Promise<Response> {
  const headers: Record<string, string> = { 'X-Requested-With': 'belle' };
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken && o.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}${qs(o.query)}`, {
    method: o.method ?? 'GET', headers, credentials: 'include', signal: o.signal,
    body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
  });
  if (res.status === 401 && o.auth !== false && !retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return send(path, o, true);
    accessToken = null;
    onAuthLost?.();
  }
  return res;
}

async function parse(res: Response) {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) {
    if (res.ok) return { data: await res.text() as unknown, meta: undefined as Meta | undefined };
    throw new ApiError(res.status, 'HTTP_ERROR', 'Something went wrong. Please try again.');
  }
  const json = await res.json();
  if (!res.ok || json.success === false) {
    const e = json.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong. Please try again.', e.details?.fields ?? []);
  }
  return { data: json.data, meta: json.meta as Meta | undefined };
}

export async function request<T>(path: string, o: Opts = {}) {
  try {
    return (await parse(await send(path, o))) as { data: T; meta?: Meta };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'No connection. Check your internet and try again.');
  }
}

export const get = async <T,>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) => (await request<T>(path, { query, signal })).data;
export const getPage = <T,>(path: string, query?: Record<string, unknown>) => request<T[]>(path, { query });
export const post = async <T,>(path: string, body?: unknown) => (await request<T>(path, { method: 'POST', body: body ?? {} })).data;
export const put = async <T,>(path: string, body?: unknown) => (await request<T>(path, { method: 'PUT', body: body ?? {} })).data;
export const patch = async <T,>(path: string, body?: unknown) => (await request<T>(path, { method: 'PATCH', body: body ?? {} })).data;
export const del = async <T,>(path: string) => (await request<T>(path, { method: 'DELETE' })).data;
export const upload = async <T,>(path: string, form: FormData) => (await request<T>(path, { method: 'POST', form })).data;

/** Authenticated file download (CSV) — the token lives in memory, so a plain <a href> would not be signed in. */
export async function download(path: string, query: Record<string, unknown>, filename: string) {
  const res = await send(`${path}`, { query });
  if (!res.ok) await parse(res);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
