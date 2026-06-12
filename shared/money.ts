/** Money is stored as exact decimal strings (NUMERIC(10,2)); arithmetic uses integer cents. */
export function toCents(value: string | number): number {
  const s = typeof value === 'number' ? value.toFixed(2) : value;
  const [whole, frac = ''] = s.split('.');
  const neg = whole.startsWith('-');
  const w = Math.abs(parseInt(whole || '0', 10));
  const c = parseInt((frac + '00').slice(0, 2), 10);
  const cents = w * 100 + c;
  return neg ? -cents : cents;
}

export function fromCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatEtb(value: string | number, locale: 'en' | 'am' = 'en'): string {
  const cents = toCents(value);
  const whole = Math.floor(Math.abs(cents) / 100).toLocaleString('en-US');
  const frac = Math.abs(cents) % 100;
  const amount = frac === 0 ? whole : `${whole}.${String(frac).padStart(2, '0')}`;
  return locale === 'am' ? `${amount} ብር` : `ETB ${amount}`;
}
