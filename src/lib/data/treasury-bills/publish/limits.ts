/**
 * Safety limits for publishing. Each one is a judgement, not a measurement: it separates "CBN changed
 * something small" from "something is badly wrong with this download". When a limit refuses a download,
 * nothing is published and the last good file stays in place. Change a number here, in one place.
 *
 * Reference point (7 Nov 2026): 1,824 records, 1 rejected (0.05%), 45 observations with an invalid field (2.5%).
 */
export interface PublishLimits {
  /** Refuse a response body larger than this many bytes (the real one is under 1 MB). */
  maxBodyBytes: number;
  /** Fewer records than this is not the full history (the real feed has about 1,800). */
  minRecords: number;
  /** Share of records that must carry every field CBN is expected to send. A renamed field fails this. */
  minFieldCoverage: number;
  /** More than this share of records rejected outright (for example a changed security type) is a failure. */
  maxRejectedShare: number;
  /** More than this share of observations with an invalid field (for example a changed date format) is a failure. */
  maxInvalidShare: number;
  /** A new download with more than this share fewer records than the last good one is refused. */
  maxShrinkShare: number;
}

export const PUBLISH_LIMITS: PublishLimits = {
  maxBodyBytes: 20_000_000,
  minRecords: 1_000,
  minFieldCoverage: 0.99,
  maxRejectedShare: 0.02,
  maxInvalidShare: 0.1,
  maxShrinkShare: 0.02,
};