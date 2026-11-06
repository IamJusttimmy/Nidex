/**
 * Every threshold the classifier uses lives here, in one versioned object.
 * Changing a value only changes how the SAME stored rows are classified.
 * Source values are never modified, so every exclusion is reversible.
 */
export interface QualityRules {
  version: string;

  /** single_observation_reversion: |current / previous - 1| must exceed this ... */
  spikeJump: number;
  /** ... and |next / previous - 1| must stay below this. */
  spikeRevert: number;

  /**
   * Abnormal spread: |sell - buy| / ((buy + sell) / 2) greater than
   * spreadMultiplier x that currency's median spread.
   */
  spreadMultiplier: number;
  /** Floor for the median baseline, so a currency with a near-zero spread is not over-sensitive. */
  spreadBaselineFloor: number;

  /**
   * Midpoint tolerance. A midpoint outside [min(buy,sell), max(buy,sell)] by no more
   * than this absolute amount is treated as rounding and is valid.
   */
  midRoundingTolerance: number;
  /**
   * Beyond rounding, a midpoint outside the buy-sell range by more than this fraction
   * (measured from the nearest edge of the range) is invalid; smaller deviations are suspicious.
   */
  midInvalidDeviation: number;
  /**
   * When the quote pair is invalid (buy above sell) the buy-sell range is not meaningful, and in
   * practice the midpoint is usually the correct value there (it fits the neighbouring days).
   * If true, the midpoint-outside-range check is skipped for those rows. Other midpoint checks still run.
   */
  skipMidRangeCheckWhenPairInvalid: boolean;

  /**
   * Promote a suspicious single_observation_reversion to invalid ONLY when there is a
   * mechanical explanation that is confirmed against the surrounding observations
   * (see mechanical.ts). Switch off to see the same rows as merely suspicious.
   */
  promoteMechanicalErrors: boolean;
  /**
   * Power-of-ten test: the value divided by 10^n must land within this fraction of BOTH the
   * previous and the next observation.
   */
  powerOfTenTolerance: number;

  /** Cross-rate warning: implied cross rate vs USD differs from its neighbours' by more than this fraction. Evidence only. */
  crossRateThreshold: number;
  /**
   * Currencies left out of the cross-rate check because their rate against USD is too noisy to
   * be informative (see the review report): XOF and XUA move in lockstep with each other and
   * break their USD cross on days when USD itself steps.
   */
  crossRateExcludedCodes: string[];
}

export const DEFAULT_RULES: QualityRules = {
  version: "2026-11-06.1",
  spikeJump: 0.2,
  spikeRevert: 0.1,
  spreadMultiplier: 5,
  spreadBaselineFloor: 0.0001,
  midRoundingTolerance: 0.0001,
  midInvalidDeviation: 0.01,
  skipMidRangeCheckWhenPairInvalid: true,
  promoteMechanicalErrors: true,
  powerOfTenTolerance: 0.05,
  crossRateThreshold: 0.05,
  crossRateExcludedCodes: ["XOF", "XUA"],
};
