import { tenantDayBounds, tenantDateBounds } from './analytics-time';

describe('tenantDayBounds', () => {
  it('uses local calendar midnight for Minsk, including the UTC offset', () => {
    expect(tenantDayBounds('Europe/Minsk', new Date('2026-09-30T08:00:00.000Z'))).toEqual({
      start: new Date('2026-09-29T21:00:00.000Z'),
      end: new Date('2026-09-30T21:00:00.000Z'),
    });
  });
});

describe('tenantDateBounds', () => {
  it('uses tenant-local calendar midnights across daylight saving changes', () => {
    expect(tenantDateBounds('2026-03-08', '2026-03-09', 'America/New_York')).toEqual({
      start: new Date('2026-03-08T05:00:00.000Z'),
      end: new Date('2026-03-09T04:00:00.000Z'),
    });
  });
});
