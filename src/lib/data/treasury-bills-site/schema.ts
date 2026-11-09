import { z } from "zod";
import { REASON_CODES, WARNING_CODES } from "../treasury-bills/quality";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const reasonSchema = z.object({
  code: z.enum(REASON_CODES),
  message: z.string(),
  detail: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
});

const assessmentSchema = z.object({
  status: z.enum(["valid", "suspicious", "invalid"]),
  presence: z.enum(["published", "not-published", "unparseable"]),
  reasons: z.array(reasonSchema),
});

/**
 * What the rate series reads from each observation. Fields are added here only when a page starts to use
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
  rateLabel: z.object({ raw: z.string(), display: z.string().nullable() }),
  warnings: z.array(z.looseObject({ code: z.enum(WARNING_CODES) })),
  quality: z.looseObject({ rate: assessmentSchema }),
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
  observations: z.array(observationSchema),
});

export type TreasuryBillsDocument = z.infer<typeof treasuryBillsSchema>;