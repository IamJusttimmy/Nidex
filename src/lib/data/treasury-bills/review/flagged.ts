import {
  AMOUNT_FIELDS,
  FIELD_LABELS,
  isRateSeriesEligible,
  NTB_FIELDS,
  RAW_KEY_OF_FIELD,
  REASON_TITLES,
  type NtbField,
  type NtbSummary,
  type Presence,
  type QualityStatus,
  type ReasonCode,
  type TenorGroupDays,
  type WarningCode,
} from "../quality";

/** The parts of an observation the review reads. A full observation fits this. */
export interface ReviewObservation {
  id: number;
  auctionDate: string | null;
  rate: number | null;
  tenor: { rawText: string; group: TenorGroupDays | null };
  rateLabel: { raw: string };
  raw: Readonly<Record<string, unknown>>;
  quality: Readonly<
    Record<NtbField, { status: QualityStatus; presence: Presence; reasons: readonly { code: ReasonCode; message: string }[] }>
  >;
  warnings: readonly { code: WarningCode }[];
}

/**
 * - invalid / suspicious: the checker's verdict on the field.
 * - not-published: only for the rate. CBN gave no rate, so the auction has none to show (it is not "wrong").
 */
export type ReviewLevel = "invalid" | "suspicious" | "not-published";

export interface ReviewField {
  field: NtbField;
  label: string;
  level: ReviewLevel;
  /** The value exactly as CBN published it. */
  rawText: string;
  reasons: { code: ReasonCode; title: string; message: string }[];
  isAmount: boolean;
}

/** Is the auction's rate on the rate chart? Decided by the same function the chart uses. */
export type ChartStatus = "on-chart" | "only-with-suspicious" | "off-chart";

export interface ReviewRow {
  id: number;
  date: string | null;
  rawDate: string;
  rawTenor: string;
  rawLabel: string;
  /** The most serious level among the flagged fields. */
  worst: ReviewLevel;
  fields: ReviewField[];
  chart: ChartStatus;
  warnings: WarningCode[];
}

const SEVERITY: Record<ReviewLevel, number> = { invalid: 0, suspicious: 1, "not-published": 2 };

function chartStatus(o: ReviewObservation): ChartStatus {
  if (isRateSeriesEligible(o)) return "on-chart";
  return isRateSeriesEligible(o, { includeSuspicious: true }) ? "only-with-suspicious" : "off-chart";
}

const text = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/**
 * Every auction that was questioned or left off the rate chart, newest first, with each flagged field's
 * original published text and the reasons. Nothing is changed or hidden: a valid auction whose rate is on
 * the chart and has no flagged field is simply not listed.
 *
 * A row is listed when at least one field is suspicious or invalid, or when the auction is not on the rate
 * chart (for example CBN gave no rate). A flag on any field other than the rate never takes a valid rate off
 * the chart; the `chart` value says what actually happens.
 */
export function flaggedRows(observations: readonly ReviewObservation[]): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const o of observations) {
    const fields: ReviewField[] = [];
    for (const field of NTB_FIELDS) {
      const q = o.quality[field];
      const level: ReviewLevel | null =
        q.status !== "valid" ? q.status : field === "rate" && q.presence !== "published" ? "not-published" : null;
      if (level === null) continue;
      fields.push({
        field,
        label: FIELD_LABELS[field],
        level,
        rawText: text(o.raw[RAW_KEY_OF_FIELD[field]]),
        reasons: q.reasons.map((r) => ({ code: r.code, title: REASON_TITLES[r.code], message: r.message })),
        isAmount: AMOUNT_FIELDS.includes(field),
      });
    }
    const chart = chartStatus(o);
    if (fields.length === 0 && chart === "on-chart") continue;
    rows.push({
      id: o.id,
      date: o.auctionDate,
      rawDate: text(o.raw[RAW_KEY_OF_FIELD.auctionDate]),
      rawTenor: o.tenor.rawText,
      rawLabel: o.rateLabel.raw,
      worst: fields.reduce<ReviewLevel>((w, f) => (SEVERITY[f.level] < SEVERITY[w] ? f.level : w), "not-published"),
      fields,
      chart,
      warnings: o.warnings.map((w) => w.code),
    });
  }
  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date === null ? 1 : b.date === null ? -1 : a.date < b.date ? 1 : -1;
    return b.id - a.id;
  });
}

export interface ReviewFilter {
  level: ReviewLevel | "all";
  field: NtbField | "all";
}

/** Rows with at least one flagged field that satisfies both choices. A kept row still shows all its flagged fields. */
export function filterRows(rows: readonly ReviewRow[], filter: ReviewFilter): ReviewRow[] {
  return rows.filter((r) => r.fields.some((f) => (filter.level === "all" || f.level === filter.level) && (filter.field === "all" || f.field === filter.field)));
}

export interface ReviewCounts {
  total: number;
  /** Rows with at least one flagged field of this level. */
  byLevel: Record<ReviewLevel, number>;
  /** Rows in which this field is flagged. */
  byField: Record<NtbField, number>;
  offChart: number;
}

export function reviewCounts(rows: readonly ReviewRow[]): ReviewCounts {
  const byLevel: Record<ReviewLevel, number> = { invalid: 0, suspicious: 0, "not-published": 0 };
  const byField = Object.fromEntries(NTB_FIELDS.map((f) => [f, 0])) as Record<NtbField, number>;
  let offChart = 0;
  for (const r of rows) {
    for (const level of new Set(r.fields.map((f) => f.level))) byLevel[level]++;
    for (const field of new Set(r.fields.map((f) => f.field))) byField[field]++;
    if (r.chart !== "on-chart") offChart++;
  }
  return { total: rows.length, byLevel, byField, offChart };
}

export interface RuleRow {
  field: NtbField;
  fieldLabel: string;
  code: ReasonCode;
  title: string;
  /** "note" means the rule fired but the field stayed valid (for example a label spelling was standardised). */
  result: "invalid" | "suspicious" | "note";
  records: number;
  firstDate: string | null;
  lastDate: string | null;
}

const RESULT_ORDER: Record<RuleRow["result"], number> = { invalid: 0, suspicious: 1, note: 2 };

/** One row per rule and field from the published summary, most serious first, then by how many records it touched. */
export function ruleRows(reasons: NtbSummary["reasons"]): RuleRow[] {
  return reasons
    .map((r) => ({
      field: r.field,
      fieldLabel: FIELD_LABELS[r.field],
      code: r.code,
      title: REASON_TITLES[r.code],
      result: r.status === "valid" ? ("note" as const) : r.status,
      records: r.records,
      firstDate: r.firstDate,
      lastDate: r.lastDate,
    }))
    .sort((a, b) => RESULT_ORDER[a.result] - RESULT_ORDER[b.result] || b.records - a.records || a.title.localeCompare(b.title));
}
