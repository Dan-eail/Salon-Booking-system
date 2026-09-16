import { describe, expect, it } from 'vitest';
import { formatEtb, fromCents, toCents } from '@shared/money';
import { formatPhone, isValidPhone, normalizePhone } from '@shared/phone';

describe('shared / phone', () => {
  describe('normalizePhone', () => {
    it('normalises various Ethiopian mobile formats with prefix 9', () => {
      expect(normalizePhone('0911234567')).toBe('+251911234567');
      expect(normalizePhone('911234567')).toBe('+251911234567');
      expect(normalizePhone('+251911234567')).toBe('+251911234567');
      expect(normalizePhone('251911234567')).toBe('+251911234567');
      expect(normalizePhone('00251911234567')).toBe('+251911234567');
    });

    it('normalises Safaricom numbers with prefix 7', () => {
      expect(normalizePhone('0712345678')).toBe('+251712345678');
      expect(normalizePhone('712345678')).toBe('+251712345678');
      expect(normalizePhone('+251712345678')).toBe('+251712345678');
    });

    it('handles spaces, dashes, parentheses and dots', () => {
      expect(normalizePhone('0911 234 567')).toBe('+251911234567');
      expect(normalizePhone('0911-23-45-67')).toBe('+251911234567');
      expect(normalizePhone('+251 (911) 234.567')).toBe('+251911234567');
    });

    it('accepts valid foreign international numbers in E.164 format', () => {
      expect(normalizePhone('+12125551234')).toBe('+12125551234');
      expect(normalizePhone('+442071838750')).toBe('+442071838750');
      expect(normalizePhone('+971501234567')).toBe('+971501234567');
    });

    it('rejects invalid, short, or malformed inputs', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('    ')).toBeNull();
      expect(normalizePhone('abc')).toBeNull();
      expect(normalizePhone('091123')).toBeNull(); // too short
      expect(normalizePhone('0811234567')).toBeNull(); // 08 is not a valid Ethiopian mobile prefix
      expect(normalizePhone('+251811234567')).toBeNull();
      expect(normalizePhone('0911234567890')).toBeNull(); // too long
    });
  });

  describe('isValidPhone', () => {
    it('returns true for valid phones and false for invalid', () => {
      expect(isValidPhone('0911234567')).toBe(true);
      expect(isValidPhone('+251712345678')).toBe(true);
      expect(isValidPhone('12345')).toBe(false);
      expect(isValidPhone('')).toBe(false);
    });
  });

  describe('formatPhone', () => {
    it('formats Ethiopian phone numbers into human-friendly groups', () => {
      expect(formatPhone('+251911234567')).toBe('+251 911 234 567');
      expect(formatPhone('+251712345678')).toBe('+251 712 345 678');
    });

    it('leaves international numbers unchanged', () => {
      expect(formatPhone('+12125551234')).toBe('+12125551234');
    });
  });
});

describe('shared / money', () => {
  describe('toCents', () => {
    it('converts number and string ETB amounts to integer cents', () => {
      expect(toCents(500)).toBe(50000);
      expect(toCents('500')).toBe(50000);
      expect(toCents('500.00')).toBe(50000);
      expect(toCents('450.50')).toBe(45050);
      expect(toCents('450.5')).toBe(45050);
      expect(toCents('0.05')).toBe(5);
      expect(toCents(0)).toBe(0);
      expect(toCents('-50.00')).toBe(-5000);
    });
  });

  describe('fromCents', () => {
    it('converts integer cents back to exact 2-decimal string', () => {
      expect(fromCents(50000)).toBe('500.00');
      expect(fromCents(45050)).toBe('450.50');
      expect(fromCents(5)).toBe('0.05');
      expect(fromCents(0)).toBe('0.00');
      expect(fromCents(-5000)).toBe('-50.00');
    });
  });

  describe('formatEtb', () => {
    it('formats amounts with ETB prefix in English', () => {
      expect(formatEtb(500)).toBe('ETB 500');
      expect(formatEtb('500.50')).toBe('ETB 500.50');
      expect(formatEtb(15000)).toBe('ETB 15,000');
      expect(formatEtb('1234.75')).toBe('ETB 1,234.75');
    });

    it('formats amounts in Amharic with ብር suffix', () => {
      expect(formatEtb(500, 'am')).toBe('500 ብር');
      expect(formatEtb('1234.50', 'am')).toBe('1,234.50 ብር');
    });
  });
});
