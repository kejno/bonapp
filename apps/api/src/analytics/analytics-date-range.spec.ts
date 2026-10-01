import { tenantDateBounds } from './analytics-time';

describe('analytics calendar date ranges', () => {
  it('includes the complete tenant-local end date across DST', () => {
    const { start, end } = tenantDateBounds('2026-03-08', '2026-03-09', 'America/New_York');
    expect(start).toEqual(new Date('2026-03-08T05:00:00.000Z'));
    expect(end).toEqual(new Date('2026-03-09T04:00:00.000Z'));
  });
});
