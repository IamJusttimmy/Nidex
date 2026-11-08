import { RAW_TEXT_FIELDS, summarizeNtb, type NtbQualityReport } from "../quality";
import { PUBLISH_LIMITS, type PublishLimits } from "./limits";

/** Every way a publish can be refused. Each one leaves the last good file exactly as it was. */
export const REFUSAL_CODES = [
  // the download itself
  "download_failed",
  "bad_status",
  "wrong_host",
  "too_large",
  // the body
  "empty_response",
  "html_response",
  "not_json",
  "not_an_array",
  // the structure of the records
  "too_few_records",
  "unexpected_fields",
  // the result of the quality checker
  "too_many_rejected",
  "too_many_invalid",
  // comparison with the last good file
  "previous_unreadable",
  "dataset_shrunk",
  "latest_date_older",
  // writing
  "not_serializable",
  "readback_mismatch",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export class PublishRefusal extends Error {
  readonly code: RefusalCode;
  constructor(code: RefusalCode, message: string) {
    super(message);
    this.name = "PublishRefusal";
    this.code = code;
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Turn the downloaded text into the array of records. Anything else is refused. */
export function parseResponseBody(text: string): unknown[] {
  const t = text.trim();
  if (t === "") throw new PublishRefusal("empty_response", "CBN sent an empty response.");
  if (t.startsWith("<")) {
    throw new PublishRefusal(
      "html_response",
      "CBN sent a web page instead of data (for example a security challenge page). Nothing was published.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new PublishRefusal("not_json", "The response is not valid JSON, so it may have been cut off or changed.");
  }
  if (!Array.isArray(parsed)) {
    throw new PublishRefusal("not_an_array", "The response is JSON but not the expected list of records.");
  }
  return parsed;
}

const EXPECTED_KEYS = ["id", ...RAW_TEXT_FIELDS] as const;

/** Check that the list looks like the full CBN feed before any record is classified. */
export function checkStructure(records: unknown[], limits: PublishLimits = PUBLISH_LIMITS): void {
  if (records.length < limits.minRecords) {
    throw new PublishRefusal(
      "too_few_records",
      `The response has ${records.length} records; fewer than ${limits.minRecords} is not the full history.`,
    );
  }
  const missing = new Map<string, number>();
  let complete = 0;
  for (const r of records) {
    const absent =
      typeof r === "object" && r !== null && !Array.isArray(r)
        ? EXPECTED_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(r, k))
        : [...EXPECTED_KEYS];
    if (absent.length === 0) complete++;
    for (const k of absent) missing.set(k, (missing.get(k) ?? 0) + 1);
  }
  const coverage = complete / records.length;
  if (coverage < limits.minFieldCoverage) {
    const worst = [...missing.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => `${k} (missing in ${n})`)
      .join(", ");
    throw new PublishRefusal(
      "unexpected_fields",
      `Only ${pct(coverage)} of records carry every expected field (need ${pct(limits.minFieldCoverage)}). Most often missing: ${worst}.`,
    );
  }
}

/** Check the quality checker's own verdict on the whole download. */
export function checkQuality(report: NtbQualityReport, limits: PublishLimits = PUBLISH_LIMITS): void {
  const total = report.sourceCount;
  const rejectedShare = total === 0 ? 1 : report.rejected.length / total;
  if (rejectedShare > limits.maxRejectedShare) {
    throw new PublishRefusal(
      "too_many_rejected",
      `${report.rejected.length} of ${total} records (${pct(rejectedShare)}) were rejected outright; more than ${pct(limits.maxRejectedShare)} means the format has probably changed.`,
    );
  }
  const summary = summarizeNtb(report);
  const invalid = summary.recordsByWorstStatus.invalid;
  const invalidShare = summary.observations === 0 ? 1 : invalid / summary.observations;
  if (invalidShare > limits.maxInvalidShare) {
    throw new PublishRefusal(
      "too_many_invalid",
      `${invalid} of ${summary.observations} observations (${pct(invalidShare)}) have an invalid field; more than ${pct(limits.maxInvalidShare)} means the format has probably changed.`,
    );
  }
}

export interface DatasetStamp {
  recordCount: number;
  lastAuctionDate: string | null;
}

/** Compare a new download with the last good file. Going backwards is refused unless explicitly allowed. */
export function checkNotRegressing(
  next: DatasetStamp,
  previous: DatasetStamp,
  options: { allowRegression?: boolean; limits?: PublishLimits } = {},
): void {
  if (options.allowRegression === true) return;
  const limits = options.limits ?? PUBLISH_LIMITS;
  const floor = Math.floor(previous.recordCount * (1 - limits.maxShrinkShare));
  if (next.recordCount < floor) {
    throw new PublishRefusal(
      "dataset_shrunk",
      `The new download has ${next.recordCount} records; the last good file has ${previous.recordCount} (more than ${pct(limits.maxShrinkShare)} fewer).`,
    );
  }
  if (previous.lastAuctionDate !== null && (next.lastAuctionDate === null || next.lastAuctionDate < previous.lastAuctionDate)) {
    throw new PublishRefusal(
      "latest_date_older",
      `The newest auction in the new download (${next.lastAuctionDate ?? "none readable"}) is older than in the last good file (${previous.lastAuctionDate}).`,
    );
  }
}