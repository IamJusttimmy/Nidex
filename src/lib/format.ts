const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-05" -> "5 Nov 2026". Works on the text, so time zones cannot shift the date. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** "2026-11-06T20:22:10.482Z" -> "6 Nov 2026, 20:22 UTC". */
export function formatDateTimeUtc(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  if (!match) return iso;
  return `${formatDate(match[1])}, ${match[2]} UTC`;
}

/** Rates are published to 4 decimals. Show 2 decimals from 100 up and 4 below. */
export function formatRate(value: number): string {
  return value >= 100
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value.toFixed(4);
}