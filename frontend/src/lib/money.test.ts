import { describe, expect, it } from 'vitest';
import { centsToInput, formatMoney, parseMoneyInput } from './money';

describe('money', () => {
  it('parses typed amounts into cents', () => {
    expect(parseMoneyInput('12')).toBe(1200);
    expect(parseMoneyInput('12.5')).toBe(1250);
    expect(parseMoneyInput(' 0.05 ')).toBe(5);
    expect(parseMoneyInput('1234567.99')).toBe(123456799);
  });

  it('refuses anything that is not a clean non-negative amount', () => {
    for (const bad of ['', '-1', '1.234', 'abc', '1,50', '1e3', '.5', '12345678']) {
      expect(parseMoneyInput(bad)).toBeNull();
    }
  });

  it('formats cents and round-trips the edit value', () => {
    expect(formatMoney(1250, 'MYR', 'en-MY')).toContain('12.50');
    expect(centsToInput(1250)).toBe('12.50');
    expect(parseMoneyInput(centsToInput(99))).toBe(99);
  });
});
