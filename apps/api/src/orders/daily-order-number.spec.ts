import { nextDailyOrderNumber, tenantLocalDate } from './daily-order-number';

describe('daily order numbering', () => {
  it('continues within the tenant day and resets on its next local day', () => {
    expect(nextDailyOrderNumber(8, '2026-09-27', '2026-09-27')).toBe(9);
    expect(nextDailyOrderNumber(8, '2026-09-26', '2026-09-27')).toBe(1);
    expect(nextDailyOrderNumber(8, null, '2026-09-27')).toBe(1);
  });

  it('uses the tenant timezone when identifying a calendar day', () => {
    expect(tenantLocalDate('Europe/Minsk', new Date('2026-09-26T21:30:00.000Z'))).toBe('2026-09-27');
  });
});
