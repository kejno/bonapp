export function getDayBoundsUtc(
  timezone: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parseInt(dateParts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(dateParts.find((p) => p.type === 'month')!.value, 10);
  const day = parseInt(dateParts.find((p) => p.type === 'day')!.value, 10);

  return getDateBoundsUtc(timezone, `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

export function getDateBoundsUtc(
  timezone: string,
  dateStr: string,
): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Midnight UTC of the given calendar date as a reference
  const approx = new Date(Date.UTC(year, month - 1, day));

  // Determine the local time at approx in the target timezone
  const approxParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(approx);

  const approxDay = parseInt(approxParts.find((p) => p.type === 'day')!.value, 10);
  const approxH = parseInt(approxParts.find((p) => p.type === 'hour')!.value, 10) % 24;
  const approxM = parseInt(approxParts.find((p) => p.type === 'minute')!.value, 10);
  const approxS = parseInt(approxParts.find((p) => p.type === 'second')!.value, 10);

  const localSeconds = approxH * 3600 + approxM * 60 + approxS;

  // For UTC+ timezones: approx (midnight UTC) falls on the same calendar day locally.
  // For UTC- timezones: approx falls on the previous calendar day locally.
  const startMs =
    approxDay === day
      ? approx.getTime() - localSeconds * 1000
      : approx.getTime() + (86400 - localSeconds) * 1000;

  return {
    start: new Date(startMs),
    end: new Date(startMs + 86400000 - 1),
  };
}
