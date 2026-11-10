import { z } from "zod";
import {
  NTB_FIELDS,
  RAW_KEY_OF_FIELD,
  REASON_CODES,
  REJECTION_KINDS,
  WARNING_CODES,
  type NtbField,
} from "../treasury-bills/quality";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const statusSchema = z.enum(["valid", "suspicious", "invalid"]);

const reasonSchema = z.object({
  code: z.enum(REASON_CODES),
  message: z.string(),
  detail: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
});

const assessmentSchema = z.object({
  status: statusSchema,
  presence: z.enum(["published", "not-published", "unparseable"]),
  reasons: z.array(reasonSchema),
});

/** The judged fields, as a list zod accepts. NTB_FIELDS is declared as a plain array, so it is narrowed here once. */
const fieldSchema = z.enum(NTB_FIELDS as unknown as [NtbField, ...NtbField[]]);

/** One assessment for every judged field. A file missing any of them is refused. */
const qualityShape = Object.fromEntries(NTB_FIELDS.map((f) => [f, assessmentSchema])) as Record<NtbField, typeof assessmentSchema>;

/** The published text of every judged field, exactly as CBN wrote it. */
const rawKeys = [...new Set(Object.values(RAW_KEY_OF_FIELD))];
const rawShape = Object.fromEntries(rawKeys.map((k) => [k, z.string()])) as Record<(typeof RAW_KEY_OF_FIELD)[NtbField], z.ZodString>;

/**
 * What the page reads from each observation. Fields are added here only when a page starts to use
 * them, and each one is checked on the way in. Extra fields in the file are allowed and left untouched.
 */
const observationSchema = z.looseObject({
  id: z.number().int(),
  auctionDate: isoDate.nullable(),
  tenor: z.looseObject({
    rawText: z.string(),
    group: z.union([z.literal(91), z.literal(182), z.literal(364)]).nullable(),
  }),
  rate: z.number().finite().nullable(),
  trueYield: z.number().finite().nullable(),
  /** The record exactly as CBN published it. The text of each judged field is read; other fields are left alone. */
  raw: z.looseObject(rawShape),
  rateLabel: z.object({ raw: z.string(), display: z.string().nullable() }),
  warnings: z.array(z.looseObject({ code: z.enum(WARNING_CODES) })),
  quality: z.object(qualityShape),
});

/**
 * The published file the website reads (public/data/treasury-bills/latest.json). A file that does not match
 * is refused as a whole: the page never shows a partly understood dataset.
 *
 * schemaVersion is 1 here and in publish/document.ts (a test keeps the two equal). If the publisher changes
 * the layout it must raise that number, and the website stops accepting the file until this schema is updated.
 */
export const treasuryBillsSchema = z.object({
  schemaVersion: z.literal(1),
  dataset: z.literal("treasury-bills-ntb"),
  rulesVersion: z.string().min(1),
  source: z.object({
    name: z.string(),
    endpoint: z.string(),
    origin: z.enum(["network", "file"]),
    /** When this exact data was first fetched. Not the date of any auction. */
    fetchedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Expected a date and time"),
    recordCount: z.number().int().nonnegative(),
    contentSha256: z.string().min(1),
    firstAuctionDate: isoDate.nullable(),
    lastAuctionDate: isoDate.nullable(),
  }),
  /** The unit of the amount fields is unconfirmed. If the publisher ever says otherwise, this must be reviewed. */
  amounts: z.looseObject({ unit: z.literal("unconfirmed") }),
  /** The checker's own counts. The page shows them as published and never recounts them differently. */
  summary: z.looseObject({
    sourceRecords: z.number().int().nonnegative(),
    observations: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    recordsByWorstStatus: z.object({
      valid: z.number().int().nonnegative(),
      suspicious: z.number().int().nonnegative(),
      invalid: z.number().int().nonnegative(),
    }),
    reasons: z.array(
      z.object({
        field: fieldSchema,
        code: z.enum(REASON_CODES),
        status: statusSchema,
        records: z.number().int().nonnegative(),
        firstDate: isoDate.nullable(),
        lastDate: isoDate.nullable(),
        sampleIds: z.array(z.number().int()),
      }),
    ),
  }),
  observations: z.array(observationSchema),
  /** Source records that could not become observations. Kept, never dropped. */
  rejected: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      id: z.number().int().nullable(),
      kind: z.enum(REJECTION_KINDS),
      message: z.string(),
      raw: z.unknown(),
    }),
  ),
});

export type TreasuryBillsDocument = z.infer<typeof treasuryBillsSchema>;
