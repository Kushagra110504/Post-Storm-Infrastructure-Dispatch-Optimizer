import { describe, it, expect } from 'vitest';
import { createMulberry32 } from '../src/core/rng/mulberry32';

describe('mulberry32 seeded PRNG', () => {
  it('produces deterministic pseudo-random sequences for a given seed', () => {
    const rng1 = createMulberry32(12345);
    const rng2 = createMulberry32(12345);

    const seq1 = Array.from({ length: 5 }, () => rng1());
    const seq2 = Array.from({ length: 5 }, () => rng2());

    expect(seq1).toEqual(seq2);
    seq1.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createMulberry32(100);
    const rng2 = createMulberry32(200);

    const val1 = rng1();
    const val2 = rng2();

    expect(val1).not.toEqual(val2);
  });
});
