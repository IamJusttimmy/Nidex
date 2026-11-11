import { z } from "zod";

const mfFieldAssessmentSchema = z.object({
  raw: z.string().nullable(),
  value: z.number().nullable(),
  status: z.enum(["valid", "not-published", "suspicious", "invalid"]),
  reason: z
    .enum([
      "field_absent_for_format",
      "value_blank",
      "value_unparseable",
      "value_zero_suspicious",
      "value_negative",
      "fund_missing_nav",
    ])
    .nullable(),
});

const mfObservationSchema = z.object({
  id: z.string(),
  reportingDate: z.string(),
  fundName: z.string(),
  fundManager: z.string().nullable(),
  category: z.string().nullable(),
  fields: z.object({
    navNgn:        mfFieldAssessmentSchema,
    navUsd:        mfFieldAssessmentSchema,
    unitPriceNgn:  mfFieldAssessmentSchema,
    offerPriceNgn: mfFieldAssessmentSchema,
    offerPriceUsd: mfFieldAssessmentSchema,
    bidPriceNgn:   mfFieldAssessmentSchema,
    bidPriceUsd:   mfFieldAssessmentSchema,
    unitholders:   mfFieldAssessmentSchema,
    yieldWtd:      mfFieldAssessmentSchema,
    yieldYtd:      mfFieldAssessmentSchema,
  }),
  sourceFile: z.string(),
  sourceFormat: z.enum(["2011", "2026"]),
});

const mfQualitySummarySchema = z.object({
  total: z.number(),
  byStatus: z.object({
    valid: z.number(),
    "not-published": z.number(),
    suspicious: z.number(),
    invalid: z.number(),
  }),
  rulesFired: z.record(z.string(), z.number()),
  lastReportingDate: z.string(),
  weekCount: z.number(),
  fundCount: z.number(),
});

export const mutualFundsSchema = z.object({
  retrievedAt: z.string(),
  schemaVersion: z.literal("1"),
  rules: z.object({
    version: z.string(),
  }),
  observations: z.array(mfObservationSchema),
  quality: mfQualitySummarySchema,
});

export type MutualFundsDocument = z.infer<typeof mutualFundsSchema>;
export type MfObservationSite = z.infer<typeof mfObservationSchema>;