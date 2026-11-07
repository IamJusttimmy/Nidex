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

/** A change with its sign, in the same precision as rates: "+1.2000", "−0.5000", "+1,523.50", "0.00". Uses a real minus sign. */
export function formatSigned(value: number): string {
  if (value === 0) return formatRate(0).replace(/^0\.0+$/, "0.00");
  return `${value > 0 ? "+" : "−"}${formatRate(Math.abs(value))}`;
}

/** A percentage with its sign: "+0.07%", "−1.25%". */
export function formatPercent(value: number): string {
  if (value === 0) return "0.00%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}