import { createHash } from "node:crypto";
import {
  AMOUNT_USAGE_POLICY,
  DEFAULT_RULES,
  summarizeNtb,
  type NtbObservation,
  type NtbQualityReport,
  type NtbRules,
  type NtbSummary,
  type RejectedRecord,
} from "../quality";
import { PublishRefusal } from "./guards";

export const SCHEMA_VERSION = 1;

/**
 * The file the website reads. Nothing here replaces a CBN value: every observation carries the record
 * exactly as published (`raw`) next to what Nidex read from it and what it thinks of each field.
 */
export interface PublishedNtbDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  dataset: "treasury-bills-ntb";
  rulesVersion: string;
  source: {
    name: string;
    endpoint: string;
    /** "network" for a real download; "file" when the data came from a local file (testing only). */
    origin: "network" | "file";
    /**
     * When this exact data was first fetched. A later download with identical data and rules leaves the file
     * (and this time) untouched, so a quiet day produces no change.
     */
    fetchedAt: string;
    recordCount: number;
    /** SHA-256 of the records as received. Equal hash and equal rules version means nothing changed. */
    contentSha256: string;
    firstAuctionDate: string | null;
    lastAuctionDate: string | null;
  };
  /** The amount fields are published raw. Their unit is not verified (see the usage policy). */
  amounts: { unit: "unconfirmed"; usagePolicy: typeof AMOUNT_USAGE_POLICY };
  rules: NtbRules;
  summary: NtbSummary;
  observations: NtbObservation[];
  rejected: RejectedRecord[];
}

export function hashRecords(records: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export interface BuildInput {
  records: unknown[];
  report: NtbQualityReport;
  endpoint: string;
  origin: "network" | "file";
  fetchedAt: string;
  rules?: NtbRules;
}

export function buildDocument(input: BuildInput): PublishedNtbDocument {
  const dates = input.report.observations.map((o) => o.auctionDate).filter((d): d is string => d !== null);
  const sorted = [...dates].sort();
  return {
    schemaVersion: SCHEMA_VERSION,
    dataset: "treasury-bills-ntb",
    rulesVersion: input.report.rulesVersion,
    source: {
      name: "Central Bank of Nigeria",
      endpoint: input.endpoint,
      origin: input.origin,
      fetchedAt: input.fetchedAt,
      recordCount: input.report.sourceCount,
      contentSha256: hashRecords(input.records),
      firstAuctionDate: sorted[0] ?? null,
      lastAuctionDate: sorted[sorted.length - 1] ?? null,
    },
    amounts: { unit: "unconfirmed", usagePolicy: AMOUNT_USAGE_POLICY },
    rules: input.rules ?? DEFAULT_RULES,
    summary: summarizeNtb(input.report),
    observations: input.report.observations,
    rejected: input.report.rejected,
  };
}

/** Walk the whole document and refuse anything JSON would silently change or drop (NaN, undefined, bigint...). */
export function assertJsonSafe(value: unknown, path = "document"): void {
  const bad = (what: string) => {
    throw new PublishRefusal("not_serializable", `${path} holds ${what}, which JSON cannot store faithfully.`);
  };
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) bad(`the number ${String(value)}`);
      return;
    case "undefined":
      return bad("an undefined value");
    case "bigint":
    case "function":
    case "symbol":
      return bad(`a ${typeof value}`);
    case "object": {
      if (value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v, i) => assertJsonSafe(v, `${path}[${i}]`));
        return;
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertJsonSafe(v, `${path}.${k}`);
    }
  }
}

/**
 * Valid JSON, laid out so a change shows up clearly in a diff: settings and summary indented, and each
 * observation (and rejected record) on its own line.
 */
export function serializeDocument(doc: PublishedNtbDocument): string {
  assertJsonSafe(doc);
  const parts = Object.entries(doc).map(([key, value]) => {
    let body: string;
    if (Array.isArray(value)) {
      body = value.length === 0 ? "[]" : `[\n${value.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`;
    } else {
      body = JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
    }
    return `  ${JSON.stringify(key)}: ${body}`;
  });
  const text = `{\n${parts.join(",\n")}\n}\n`;
  let back: unknown;
  try {
    back = JSON.parse(text);
  } catch {
    throw new PublishRefusal("not_serializable", "The document could not be read back after serializing.");
  }
  if (JSON.stringify(back) !== JSON.stringify(doc)) {
    throw new PublishRefusal("not_serializable", "The document changed when it was serialized and read back.");
  }
  return text;
}

/** Read the last good file. If it cannot be understood it is NOT replaced: someone should look at it. */
export function readPreviousDocument(text: string): PublishedNtbDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PublishRefusal("previous_unreadable", "The existing published file is not valid JSON, so it was left alone. Please inspect it.");
  }
  const d = parsed as Partial<PublishedNtbDocument> | null;
  const ok =
    d !== null &&
    typeof d === "object" &&
    typeof d.schemaVersion === "number" &&
    typeof d.rulesVersion === "string" &&
    typeof d.source === "object" &&
    d.source !== null &&
    typeof d.source.recordCount === "number" &&
    typeof d.source.contentSha256 === "string" &&
    (typeof d.source.lastAuctionDate === "string" || d.source.lastAuctionDate === null);
  if (!ok) {
    throw new PublishRefusal("previous_unreadable", "The existing published file does not have the expected shape, so it was left alone. Please inspect it.");
  }
  return d as PublishedNtbDocument;
}

/** Same source data, same rules and same file layout: publishing again would change nothing that matters. */
export function isUnchanged(next: PublishedNtbDocument, previous: PublishedNtbDocument): boolean {
  return (
    previous.schemaVersion === next.schemaVersion &&
    previous.rulesVersion === next.rulesVersion &&
    previous.source.contentSha256 === next.source.contentSha256
  );
}

/**
 * Check a file that has just been written, before it replaces the published one: it must read back with the
 * same reader the next run uses, and hold exactly the data that was checked.
 */
export function verifyPublished(written: string, expectedSha256: string): void {
  let back: PublishedNtbDocument;
  try {
    back = readPreviousDocument(written);
  } catch {
    throw new PublishRefusal("readback_mismatch", "The file that was just written cannot be read back, so it was not published.");
  }
  if (back.source.contentSha256 !== expectedSha256) {
    throw new PublishRefusal("readback_mismatch", "The file that was just written does not hold the data that was checked, so it was not published.");
  }
}