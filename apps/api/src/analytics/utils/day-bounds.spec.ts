import { getDateBoundsUtc, getDayBoundsUtc } from './day-bounds';

describe('getDayBoundsUtc', () => {
  it('returns correct UTC bounds for Europe/Minsk (UTC+3)', () => {
    const now = new Date('2026-09-17T10:00:00Z'); // 13:00 Minsk
    const { start, end } = getDayBoundsUtc('Europe/Minsk', now);

    expect(start.toISOString()).toBe('2026-09-16T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-17T20:59:59.999Z');
  });

  it('returns correct UTC bounds for UTC+0', () => {
    const now = new Date('2026-09-17T10:00:00Z');
    const { start, end } = getDayBoundsUtc('UTC', now);

    expect(start.toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-17T23:59:59.999Z');
  });

  it('returns correct UTC bounds for America/New_York (EDT, UTC-4 in Sep)', () => {
    const now = new Date('2026-09-17T15:00:00Z'); // 11:00 EDT
    const { start, end } = getDayBoundsUtc('America/New_York', now);

    expect(start.toISOString()).toBe('2026-09-17T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-18T03:59:59.999Z');
  });
});

describe('getDateBoundsUtc', () => {
  it('returns correct bounds for Europe/Minsk (UTC+3) on a specific date', () => {
    const { start, end } = getDateBoundsUtc('Europe/Minsk', '2026-09-17');

    expect(start.toISOString()).toBe('2026-09-16T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-17T20:59:59.999Z');
  });

  it('returns correct bounds for UTC on a specific date', () => {
    const { start, end } = getDateBoundsUtc('UTC', '2026-09-17');

    expect(start.toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-17T23:59:59.999Z');
  });

  it('returns correct bounds for America/New_York (EDT, UTC-4) on a specific date', () => {
    const { start, end } = getDateBoundsUtc('America/New_York', '2026-09-17');

    expect(start.toISOString()).toBe('2026-09-17T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-18T03:59:59.999Z');
  });

  it('span covers exactly 24 hours minus 1ms', () => {
    const { start, end } = getDateBoundsUtc('Europe/Minsk', '2026-09-17');
    expect(end.getTime() - start.getTime()).toBe(86400000 - 1);
  });
});
