import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** One currency in latest.json. Values are NGN per one unit of the currency. */
export const latestRateSchema = z.object({
  name: z.string().min(1),
  date: isoDate,
  buy: z.number().positive(),
  mid: z.number().positive(),
  sell: z.number().positive(),
});

export const latestSchema = z.object({
  base: z.literal("NGN"),
  as_of: isoDate,
  rates: z.record(z.string(), latestRateSchema),
});

export const metaSchema = z.object({
  source: z.string(),
  source_urls: z.array(z.string()),
  generated_at: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Expected a date and time"),
  rates_rows: z.number().int().nonnegative(),
  first_date: isoDate,
  last_date: isoDate,
  currencies: z.array(z.string()),
});

export type LatestRate = z.infer<typeof latestRateSchema>;
export type Latest = z.infer<typeof latestSchema>;
export type RatesMeta = z.infer<typeof metaSchema>;