import { formatEtb } from '@shared/money';

const TZ = 'Africa/Addis_Ababa';
export const money = (v: string | number, locale: 'en' | 'am' = 'en') => formatEtb(v, locale);

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const dateLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
const ymd = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });

export const fmtDate = (d: string | Date) => dateFmt.format(new Date(d));
export const fmtDateLong = (d: string | Date) => dateLong.format(new Date(d));
export const fmtTime = (d: string | Date) => timeFmt.format(new Date(d));
export const fmtDateTime = (d: string | Date) => `${fmtDate(d)}, ${fmtTime(d)}`;
/** YYYY-MM-DD in Addis Ababa time. */
export const localDate = (d: Date | string = new Date()) => ymd.format(new Date(d));
export const addDays = (date: string, n: number) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export const minutesToLabel = (m: number) => timeFmt.format(new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60) - 3, m % 60)));
export const minutesToInput = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const inputToMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const dateLabel = (date: string) => dateLong.format(new Date(`${date}T12:00:00Z`));
export const dayName = (dow: number) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
export const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
export const priceLevel = (n: number) => '$'.repeat(n).replace(/\$/g, 'Br ').trim();
/** "2030-01-07T..." → local Addis time as <input type=datetime-local> value */
export const toLocalInput = (d: Date | string) => { const x = new Date(d); return `${ymd.format(x)}T${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false }).format(x)}`; };
/** <input type=datetime-local> value (Addis time) → ISO UTC. Ethiopia has no DST (UTC+3). */
export const fromLocalInput = (s: string) => new Date(`${s}:00+03:00`).toISOString();
export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
