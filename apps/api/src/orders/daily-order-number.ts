export function nextDailyOrderNumber(currentNumber: number, counterDate: string | null, localDate: string): number {
  return counterDate === localDate ? currentNumber + 1 : 1;
}

export function tenantLocalDate(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}
