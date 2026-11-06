import Papa from "papaparse";
import { z } from "zod";
import type { ParsedObservation, RejectedRow } from "./types";

/** Stage 1 + 2 + 3: parse text, validate structure, normalise numbers. Pure. */

const REQUIRED_HEADER = ["date", "code", "buy", "mid", "sell"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a real calendar date");

const currencyCode = z.string().regex(/^[A-Z]{3}$/);

/** Structural row schema: everything stays text here. Numbers are handled in normalise(). */
export const rawRowSchema = z.object({
  date: isoDate,
  code: currencyCode,
  buy: z.string(),
  mid: z.string(),
  sell: z.string(),
});

export type NumberParse =
  | { kind: "number"; value: number }
  | { kind: "missing" }
  | { kind: "invalid" };

/**
 * "" and zero mean "not published", never a real zero. Anything that is not a
 * plain decimal number is invalid. The raw text is always kept alongside.
 */
export function parseRateNumber(text: string): NumberParse {
  const t = text.trim();
  if (t === "") return { kind: "missing" };
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { kind: "invalid" };
  const n = Number(t);
  if (!Number.isFinite(n) || n === 0) return { kind: "missing" };
  if (n < 0) return { kind: "invalid" };
  return { kind: "number", value: n };
}

export interface ParseResult {
  observations: ParsedObservation[];
  rejected: RejectedRow[];
  /** Number of data rows in the source (header excluded). */
  sourceRowCount: number;
}

export class CsvHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvHeaderError";
  }
}

export function parseRatesCsv(csvText: string): ParseResult {
  const result = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
  const rows = result.data;
  if (rows.length === 0) throw new CsvHeaderError("CSV is empty");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new CsvHeaderError(`CSV is missing required column(s): ${missing.join(", ")}`);
  }
  const col = Object.fromEntries(REQUIRED_HEADER.map((h) => [h, header.indexOf(h)])) as Record<
    (typeof REQUIRED_HEADER)[number],
    number
  >;

  const observations: ParsedObservation[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Map<string, ParsedObservation>();

  rows.slice(1).forEach((fields, i) => {
    const sourceRow = i + 1;
    const reject = (kind: RejectedRow["kind"], message: string) =>
      rejected.push({ sourceRow, kind, message, rawFields: fields });

    if (fields.length !== header.length) {
      return reject("wrong_column_count", `expected ${header.length} columns, got ${fields.length}`);
    }
    const candidate = {
      date: fields[col.date].trim(),
      code: fields[col.code].trim(),
      buy: fields[col.buy],
      mid: fields[col.mid],
      sell: fields[col.sell],
    };
    const checked = rawRowSchema.safeParse(candidate);
    if (!checked.success) {
      const field = String(checked.error.issues[0].path[0]);
      return reject(
        field === "code" ? "invalid_code" : "invalid_date",
        `${field}: ${checked.error.issues[0].message}`,
      );
    }

    const nums = {
      buy: parseRateNumber(candidate.buy),
      mid: parseRateNumber(candidate.mid),
      sell: parseRateNumber(candidate.sell),
    };
    const bad = (["buy", "mid", "sell"] as const).find((k) => nums[k].kind === "invalid");
    if (bad) return reject("invalid_number", `${bad}: "${candidate[bad]}" is not a positive decimal number`);

    const key = `${candidate.code}|${candidate.date}`;
    const obs: ParsedObservation = {
      date: candidate.date,
      code: candidate.code,
      sourceRow,
      raw: { buy: candidate.buy, mid: candidate.mid, sell: candidate.sell },
      buy: nums.buy.kind === "number" ? nums.buy.value : null,
      mid: nums.mid.kind === "number" ? nums.mid.value : null,
      sell: nums.sell.kind === "number" ? nums.sell.value : null,
    };

    const first = seen.get(key);
    if (first) {
      const same = first.raw.buy === obs.raw.buy && first.raw.mid === obs.raw.mid && first.raw.sell === obs.raw.sell;
      return reject(
        "duplicate_key",
        `${key} already appears at row ${first.sourceRow} (${same ? "identical values" : "conflicting values"}); first occurrence kept`,
      );
    }
    seen.set(key, obs);
    observations.push(obs);
  });

  return { observations, rejected, sourceRowCount: rows.length - 1 };
}
