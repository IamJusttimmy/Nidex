import type { Reason, TenorGroupDays, WarningCode } from "../quality";

/**
 * The only fields the rate series reads from an observation. Real observations from the published file
 * have more fields; the series never touches them. Keeping the input this narrow is what stops a chart
 * from quietly depending on a field it should not use.
 */
export interface SeriesObservation {
  id: number;
  auctionDate: string | null;
  tenor: { rawText: string; group: TenorGroupDays | null };
  rate: number | null;
  rateLabel: { raw: string; display: string | null };
  warnings: { code: WarningCode }[];
  quality: {
    rate: { status: "valid" | "suspicious" | "invalid"; presence: "published" | "not-published" | "unparseable"; reasons: Reason[] };
  };
}

/** One auction's rate, exactly as CBN published it, with its original label. */
export interface RateSeriesPoint {
  id: number;
  /** The auction date (ISO yyyy-mm-dd). Not the date CBN published it and not the date Nidex checked it. */
  date: string;
  /** The rate in percent, exactly as read from the published text. */
  rate: number;
  /** The rate label exactly as CBN wrote it. May be a misspelling or a plural. Never altered. */
  rawLabel: string;
  /** Nidex's standard wording of the label (typos and plural only), or null if the label is not recognised. */
  displayLabel: string | null;
  /** The tenor exactly as CBN wrote it, for example "364Day" or "363 DAY". */
  rawTenor: string;
  /** "suspicious" only appears when the viewer asked to see questionable values. */
  rateStatus: "valid" | "suspicious";
  /** Why the rate was flagged (empty for a plain valid rate). */
  rateReasons: Reason[];
  /** Cautions about the record, such as a conflicting duplicate auction. They never change the value. */
  warnings: WarningCode[];
}

/**
 * - standard: a label Nidex recognises (Issue, Marginal or Stop, after fixing typos and plurals).
 * - unrecognised: CBN wrote a label Nidex does not recognise. It gets its own option under CBN's own words.
 * - unlabelled: CBN left the label empty.
 */
export type LabelKind = "standard" | "unrecognised" | "unlabelled";

export interface RateLabelSeries {
  /** Stable id for the selector. */
  key: string;
  /** Text for the selector. */
  name: string;
  kind: LabelKind;
  /** Every original wording behind this option and how many points use each, so nothing is hidden. */
  rawLabels: { text: string; count: number }[];
  pointCount: number;
  firstDate: string;
  lastDate: string;
  /** One list per standard tenor, oldest first. A tenor with no points is an empty list. */
  tenors: Record<TenorGroupDays, RateSeriesPoint[]>;
}

export type ExclusionReason =
  | "no_auction_date"
  | "tenor_not_standard"
  | "rate_not_published"
  | "rate_invalid"
  | "rate_suspicious_hidden";

export interface RateSeriesOptions {
  /** Include rates the checker found suspicious. They stay marked as suspicious on every point. */
  includeSuspicious?: boolean;
}

export interface RateSeriesSet {
  /** Only labels that have at least one point to show. Ordered: Issue, Marginal, Stop, then any others. */
  labels: RateLabelSeries[];
  /** How many observations were looked at, shown, and left out (with the reason). included + excluded = considered. */
  considered: number;
  included: number;
  excluded: { total: number; byReason: Record<ExclusionReason, number> };
}