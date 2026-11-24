import { describe, expect, it } from 'vitest';
import { escapeLike } from '../../src/lib/sql';

describe('escapeLike', () => {
  it('escapes the LIKE wildcards and the escape character', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('Cafe Latte')).toBe('Cafe Latte');
  });
});
