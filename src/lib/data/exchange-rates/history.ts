import { DataFetchError } from "../errors";
import { fetchText } from "../fetch-text";
import { RATES_BASE_URL } from "../sources";
import {
  buildQualityReport,
  CsvHeaderError,
  VERIFICATION_OVERRIDES,
  type QualityReport,
} from "./quality";

export const RATES_CSV_URL = `${RATES_BASE_URL}/rates.csv`;

export interface RateHistory {
  /** Every parsed row, classified. Nothing is removed. */
  report: QualityReport;
  /** The downloaded CSV exactly as received. Never modified. */
  rawCsv: string;
  /** When WE downloaded and checked it (not the date of any rate). */
  fetchedAt: string;
  timings: { fetchMs: number; processMs: number };
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Downloads rates.csv, keeps the original text, and runs the quality checks once.
 * The page shows its loading state while this runs.
 */
export async function loadRateHistory(url: string = RATES_CSV_URL): Promise<RateHistory> {
  const start = performance.now();
  const rawCsv = await fetchText(url);
  const downloaded = performance.now();

  // Give the browser a chance to paint the loading state before the heavy work.
  await nextTask();

  let report: QualityReport;
  try {
    report = buildQualityReport(rawCsv, undefined, VERIFICATION_OVERRIDES);
  } catch (error) {
    if (error instanceof CsvHeaderError) {
      throw new DataFetchError("parse", error.message, url);
    }
    throw error;
  }

  if (report.observations.length === 0) {
    throw new DataFetchError("validation", "The file has no usable exchange-rate rows.", url);
  }

  const done = performance.now();
  return {
    report,
    rawCsv,
    fetchedAt: new Date().toISOString(),
    timings: {
      fetchMs: Math.round(downloaded - start),
      processMs: Math.round(done - downloaded),
    },
  };
}