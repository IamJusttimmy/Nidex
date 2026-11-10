import { MM_RATE_FIELDS } from "../quality/types";
import { MM_RULES } from "../quality/config";
import { normalizeRecord } from "./normalize";
import type { MmSourceRecord, MmObservation, MmDocument, MmRuleSummary, MmQualitySummary } from "./types";
import type { MmRateField } from "../quality/types";

const PUBLISHER = "Central Bank of Nigeria";
const ENDPOINT  = "https://www.cbn.gov.ng/api/GetAllMoneyMarketIndicators";

const RULE_DESCRIPTIONS: Record<string, string> = {
  mpr_pre_era_zero:          "MPR is '0.00' before December 2006, the month CBN introduced it.",
  mrr_post_era_empty:        "MRR is empty from December 2006 onward; MRR was replaced by MPR.",
  interbank_trailing_empty:  "Interbank call rate is empty from March 2026 onward; CBN stopped publishing it.",
  rate_zero_suspicious:      "Rate is '0.00' in a period where zero is implausible.",
  rate_empty_unexpected:     "Rate is an empty string outside any known non-publishing era.",
  rate_unparseable:          "Rate is a non-numeric string that cannot be parsed.",
};

function buildQuality(observations: MmObservation[]): MmQualitySummary {
  // Collect per-rule, per-field firing periods
  type RuleKey = `${string}:${MmRateField}`;
  const fired = new Map<RuleKey, { status: string; periods: string[] }>();

  let fullyValid = 0;
  let withSuspicious = 0;
  let withInvalid = 0;

  for (const obs of observations) {
    let hasSuspicious = false;
    let hasInvalid = false;
    let allExpected = true;

    for (const field of MM_RATE_FIELDS) {
      const a = obs.rates[field];
      if (a.status === "suspicious") hasSuspicious = true;
      if (a.status === "invalid")    hasInvalid    = true;
      if (a.status !== "valid" && a.status !== "not-published") allExpected = false;

      if (a.reason !== null) {
        const key: RuleKey = `${a.reason}:${field}`;
        const entry = fired.get(key);
        if (entry) {
          entry.periods.push(obs.period);
        } else {
          fired.set(key, { status: a.status, periods: [obs.period] });
        }
      }
    }

    if (hasInvalid)         withInvalid++;
    else if (hasSuspicious) withSuspicious++;
    else                    fullyValid++;
  }

  const rulesFired: MmRuleSummary[] = [];
  for (const [key, { status, periods }] of fired) {
    const [rule, field] = key.split(":") as [string, MmRateField];
    const sorted = [...periods].sort();
    const entry: MmRuleSummary = {
      rule,
      description: RULE_DESCRIPTIONS[rule] ?? rule,
      status,
      field,
      count: sorted.length,
    };
    if (sorted.length <= 20) {
      entry.periods = sorted;
    } else {
      entry.firstPeriod = sorted[0];
      entry.lastPeriod  = sorted[sorted.length - 1];
    }
    rulesFired.push(entry);
  }

  // Sort: most impactful first
  rulesFired.sort((a, b) => b.count - a.count);

  return { totalObservations: observations.length, fullyValid, withSuspicious, withInvalid, rulesFired };
}

/**
 * Build the full MmDocument from raw CBN source records.
 *
 * @param sourceRecords  Raw records from the CBN endpoint (any order).
 * @param retrievedAt    ISO 8601 UTC timestamp of the fetch.
 */
export function buildDocument(
  sourceRecords: MmSourceRecord[],
  retrievedAt: string,
): MmDocument {
  // Normalize, then sort oldest first
  const observations: MmObservation[] = sourceRecords
    .map(normalizeRecord)
    .sort((a, b) => a.period.localeCompare(b.period));

  const quality = buildQuality(observations);

  const periods = observations.map(o => o.period);

  return {
    source: {
      publisher: PUBLISHER,
      endpoint:  ENDPOINT,
      retrievedAt,
      rulesVersion: MM_RULES.version,
    },
    coverage: {
      firstPeriod:  periods[0]  ?? "",
      lastPeriod:   periods[periods.length - 1] ?? "",
      totalRecords: observations.length,
    },
    quality,
    observations,
  };
}