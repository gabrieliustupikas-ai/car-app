import { describe, expect, it } from '@jest/globals';
import { formatDuration, formatKm } from '../lib/format';

describe('format', () => {
  it('formats distance with locale decimals', () => {
    expect(formatKm(24_350, 'en')).toBe('24');
    expect(formatKm(4_350, 'en')).toBe('4.4');
    expect(formatKm(4_350, 'lt')).toBe('4,4');
  });
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
