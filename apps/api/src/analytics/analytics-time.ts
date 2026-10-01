function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function zonedMidnight(date: string, timezone: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dateMatch) throw new Error('Invalid calendar date');
  const [, yearText, monthText, dayText] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const localMidnight = Date.UTC(year, month - 1, day);
  if (new Date(localMidnight).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date');
  const zoned = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(localMidnight));
  const parts = Object.fromEntries(zoned.map(({ type, value }) => [type, value]));
  const offset = Date.UTC(
    Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']),
    Number(parts['hour']), Number(parts['minute']), Number(parts['second']),
  ) - localMidnight;
  return new Date(localMidnight - offset);
}

export function tenantDateBounds(from: string, to: string, timezone: string) {
  return { start: zonedMidnight(from, timezone), end: zonedMidnight(to, timezone) };
}

export function tenantDayBounds(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = `${values['year']}-${values['month']}-${values['day']}`;
  return tenantDateBounds(date, addDays(date, 1), timezone);
}
