import { MM_RATE_FIELDS } from "../quality/types";
import { MM_RULES } from "../quality/config";
import { classifyRate } from "../quality/classify";
import type { MmSourceRecord, MmObservation } from "./types";
import type { MmRateField, MmRateAssessment } from "../quality/types";

/**
 * Convert one CBN source record into a normalized observation.
 * Original values are never mutated.
 */
export function normalizeRecord(src: MmSourceRecord): MmObservation {
  const period = `${src.tyear}-${String(src.tmonth).padStart(2, "0")}`;

  const rates = {} as Record<MmRateField, MmRateAssessment>;
  for (const field of MM_RATE_FIELDS) {
    rates[field] = classifyRate(field, src[field], period, MM_RULES);
  }

  return {
    id: src.id,
    period,
    periodLabel: src.period,
    rates,
  };
}