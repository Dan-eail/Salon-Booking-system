/**
 * Normalises Ethiopian phone numbers to E.164 (+251XXXXXXXXX).
 * Accepts: +251911234567, 251911234567, 0911234567, 911234567 (mobile 9x / 7x).
 * Other international numbers are accepted if they are valid-looking E.164.
 * Returns null when the input is not a plausible phone number.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, '');
  if (!cleaned) return null;

  let digits = cleaned;
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);

  if (digits.startsWith('+251')) {
    const rest = digits.slice(4);
    return /^[79]\d{8}$/.test(rest) ? '+251' + rest : null;
  }
  if (digits.startsWith('251') && /^251[79]\d{8}$/.test(digits)) return '+' + digits;
  if (/^0[79]\d{8}$/.test(digits)) return '+251' + digits.slice(1);
  if (/^[79]\d{8}$/.test(digits)) return '+251' + digits;
  if (/^\+[1-9]\d{7,14}$/.test(digits) && !digits.startsWith('+251')) return digits;
  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

export function formatPhone(e164: string): string {
  const m = /^\+251([79])(\d{2})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+251 ${m[1]}${m[2]} ${m[3]} ${m[4]}` : e164;
}
