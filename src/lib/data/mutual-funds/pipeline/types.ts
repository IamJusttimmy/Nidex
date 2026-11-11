import type {
  MfFieldAssessment,
  MfRules,
  MfQualityStatus,
  MfReasonCode,
} from "../quality/types";

// ── Source formats ────────────────────────────────────────────────────────────

export type MfSourceFormat = "2011" | "2026";

/**
 * One fund row as returned by a format-specific parser.
 * All numeric values are raw strings at this stage; classification happens
 * in normalize.ts.
 */
export interface MfRawFundRow {
  reportingDate: string;         // YYYY-MM-DD, extracted from file header
  fundName: string;              // trimmed
  fundManager: string | null;    // null in 2011
  category: string | null;       // null in 2011; e.g. "EQUITY BASED FUNDS"
  // 2011 columns
  rawNavNgn: string | null;
  rawUnitPriceNgn: string | null;
  // 2026 columns
  rawNavUsd: string | null;
  rawOfferPriceNgn: string | null;
  rawOfferPriceUsd: string | null;
  rawBidPriceNgn: string | null;
  rawBidPriceUsd: string | null;
  rawUnitholders: string | null;
  rawYieldWtd: string | null;
  rawYieldYtd: string | null;
  // provenance
  sourceFile: string;            // filename only, not full URL
  sourceFormat: MfSourceFormat;
}

// ── Normalized observation ────────────────────────────────────────────────────

export interface MfObservation {
  /** Stable key: `${reportingDate}__${fundName}` (URL-safe, lowercased) */
  id: string;
  reportingDate: string;         // YYYY-MM-DD
  fundName: string;
  fundManager: string | null;
  category: string | null;
  fields: {
    navNgn: MfFieldAssessment;
    navUsd: MfFieldAssessment;
    unitPriceNgn: MfFieldAssessment;
    offerPriceNgn: MfFieldAssessment;
    offerPriceUsd: MfFieldAssessment;
    bidPriceNgn: MfFieldAssessment;
    bidPriceUsd: MfFieldAssessment;
    unitholders: MfFieldAssessment;
    yieldWtd: MfFieldAssessment;
    yieldYtd: MfFieldAssessment;
  };
  sourceFile: string;
  sourceFormat: MfSourceFormat;
}

// ── Document ──────────────────────────────────────────────────────────────────

export interface MfRuleSummary {
  version: string;
}

export interface MfQualitySummary {
  total: number;
  byStatus: Record<MfQualityStatus, number>;
  rulesFired: Record<string, number>;
  lastReportingDate: string;
  weekCount: number;
  fundCount: number;
}

export interface MfDocument {
  retrievedAt: string;           // ISO timestamp
  schemaVersion: "1";
  rules: MfRuleSummary;
  observations: MfObservation[]; // sorted by reportingDate asc, then fundName asc
  quality: MfQualitySummary;
}

// Re-export for convenience
export type { MfQualityStatus, MfReasonCode, MfFieldAssessment, MfRules };