import { z } from "zod/v4";
import { MM_RATE_FIELDS } from "../money-market/quality/types";

const qualityStatuses = ["valid", "not-published", "suspicious", "invalid"] as const;

const reasonCodes = [
  "mpr_pre_era_zero",
  "mrr_post_era_empty",
  "interbank_trailing_empty",
  "rate_zero_suspicious",
  "rate_empty_unexpected",
  "rate_unparseable",
] as const;

const rateAssessmentSchema = z.object({
  raw:    z.string(),
  value:  z.number().nullable(),
  status: z.enum(qualityStatuses),
  reason: z.enum(reasonCodes).nullable(),
});

const ratesShape = Object.fromEntries(
  MM_RATE_FIELDS.map(f => [f, rateAssessmentSchema])
) as Record<typeof MM_RATE_FIELDS[number], typeof rateAssessmentSchema>;

const observationSchema = z.object({
  id:          z.number().int().positive(),
  period:      z.string().regex(/^\d{4}-\d{2}$/),
  periodLabel: z.string().min(1),
  rates:       z.object(ratesShape),
});

const ruleSummarySchema = z.object({
  rule:        z.string().min(1),
  description: z.string().min(1),
  status:      z.string().min(1),
  field:       z.enum(MM_RATE_FIELDS),
  count:       z.number().int().nonnegative(),
  periods:     z.array(z.string()).optional(),
  firstPeriod: z.string().optional(),
  lastPeriod:  z.string().optional(),
});

const qualitySummarySchema = z.object({
  totalObservations: z.number().int().nonnegative(),
  fullyValid:        z.number().int().nonnegative(),
  withSuspicious:    z.number().int().nonnegative(),
  withInvalid:       z.number().int().nonnegative(),
  rulesFired:        z.array(ruleSummarySchema),
});

export const moneyMarketSchema = z.object({
  source: z.object({
    publisher:    z.string().min(1),
    endpoint:     z.string().url(),
    retrievedAt:  z.string().min(1),
    rulesVersion: z.string().min(1),
  }),
  coverage: z.object({
    firstPeriod:  z.string().regex(/^\d{4}-\d{2}$/),
    lastPeriod:   z.string().regex(/^\d{4}-\d{2}$/),
    totalRecords: z.number().int().positive(),
  }),
  quality:      qualitySummarySchema,
  observations: z.array(observationSchema).min(1),
});

export type MoneyMarketDocument = z.infer<typeof moneyMarketSchema>;