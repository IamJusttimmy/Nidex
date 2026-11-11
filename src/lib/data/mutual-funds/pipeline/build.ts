import type {
  MfObservation,
  MfDocument,
  MfQualitySummary,
} from "./types";
import { MF_RULES } from "../quality/config";
import type { MfQualityStatus, MfReasonCode } from "../quality/types";

function buildQualitySummary(observations: MfObservation[]): MfQualitySummary {
  const byStatus: Record<MfQualityStatus, number> = {
    valid: 0,
    "not-published": 0,
    suspicious: 0,
    invalid: 0,
  };
  const rulesFired: Record<string, number> = {};

  for (const obs of observations) {
    for (const assessment of Object.values(obs.fields)) {
      byStatus[assessment.status]++;
      if (assessment.reason) {
        rulesFired[assessment.reason] = (rulesFired[assessment.reason] ?? 0) + 1;
      }
    }
  }

  const reportingDates = new Set(observations.map((o) => o.reportingDate));
  const fundNames = new Set(observations.map((o) => o.fundName));
  const sortedDates = [...reportingDates].sort();

  return {
    total: observations.length,
    byStatus,
    rulesFired,
    lastReportingDate: sortedDates[sortedDates.length - 1] ?? "",
    weekCount: reportingDates.size,
    fundCount: fundNames.size,
  };
}

/**
 * Merge new observations into an existing set.
 *
 * Strategy: for each incoming reportingDate, replace ALL existing records
 * for that date with the incoming ones. This allows corrected files to fully
 * refresh a week rather than leaving stale records.
 *
 * Dates not present in the incoming set are left untouched.
 */
export function mergeObservations(
  existing: MfObservation[],
  incoming: MfObservation[],
): MfObservation[] {
  if (incoming.length === 0) return existing;

  const incomingDates = new Set(incoming.map((o) => o.reportingDate));

  // Keep existing records for dates not in the incoming set
  const kept = existing.filter((o) => !incomingDates.has(o.reportingDate));

  return [...kept, ...incoming];
}

/**
 * Sort observations: by reportingDate asc, then fundName asc.
 */
function sortObservations(observations: MfObservation[]): MfObservation[] {
  return [...observations].sort((a, b) => {
    const dateCmp = a.reportingDate.localeCompare(b.reportingDate);
    if (dateCmp !== 0) return dateCmp;
    return a.fundName.localeCompare(b.fundName);
  });
}

/**
 * Build the full MfDocument from a complete sorted observations array.
 * Call this after merging to produce the final file.
 */
export function buildDocument(
  observations: MfObservation[],
  retrievedAt: string,
): MfDocument {
  const sorted = sortObservations(observations);
  return {
    retrievedAt,
    schemaVersion: "1",
    rules: { version: MF_RULES.version },
    observations: sorted,
    quality: buildQualitySummary(sorted),
  };
}