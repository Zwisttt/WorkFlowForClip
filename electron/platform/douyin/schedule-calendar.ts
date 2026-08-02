const ENGLISH_MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export function parseSemiCalendarMonthLabel(text: string): { year: number; month: number } | null {
  const normalized = text.trim().toLocaleLowerCase();
  const year = Number(normalized.match(/[0-9]{4}/)?.[0]);
  const chineseMonth = normalized.match(/([0-9]{1,2})\s*月/)?.[1];
  const englishMonth = ENGLISH_MONTHS.findIndex((name) => normalized.includes(name)) + 1;
  const month = chineseMonth ? Number(chineseMonth) : englishMonth;
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

export function calendarNavigationDirection(
  current: { year: number; month: number },
  target: { year: number; month: number },
): 'next' | 'previous' | 'done' {
  const currentValue = current.year * 12 + current.month;
  const targetValue = target.year * 12 + target.month;
  if (currentValue === targetValue) return 'done';
  return currentValue < targetValue ? 'next' : 'previous';
}
