export function tenantDayBounds(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const localMidnight = Date.UTC(Number(values['year']), Number(values['month']) - 1, Number(values['day']));
  const offsetAt = (instant: number) => {
    const zoned = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const p = Object.fromEntries(zoned.map(({ type, value }) => [type, value]));
    return Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']), Number(p['second'])) - instant;
  };
  const start = localMidnight - offsetAt(localMidnight);
  const nextMidnight = localMidnight + 86_400_000;
  const end = nextMidnight - offsetAt(nextMidnight);
  return { start: new Date(start), end: new Date(end) };
}
