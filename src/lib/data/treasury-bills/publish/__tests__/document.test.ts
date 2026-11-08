import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildNtbQualityReport, DEFAULT_RULES } from "../../quality";
import {
  assertJsonSafe,
  buildDocument,
  hashRecords,
  isUnchanged,
  PublishRefusal,
  readPreviousDocument,
  serializeDocument,
  verifyPublished,
  writeFileAtomic,
} from "../index";
import { feed, NOW } from "./feed";

const build = (records: unknown[], over: Partial<Parameters<typeof buildDocument>[0]> = {}) =>
  buildDocument({ records, report: buildNtbQualityReport(records), endpoint: "https://example.test/ntb", origin: "network", fetchedAt: NOW, ...over });

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PublishRefusal) return e.code;
    throw e;
  }
  return "no refusal";
};

describe("buildDocument", () => {
  const records = [...feed(12), { ...feed(1)[0]!, id: 7000 }]; // the last is an exact duplicate: rejected
  const doc = build(records);

  it("carries the rules version, fetch time, source, counts and dates", () => {
    expect(doc).toMatchObject({
      schemaVersion: 1,
      dataset: "treasury-bills-ntb",
      rulesVersion: DEFAULT_RULES.version,
      source: { name: "Central Bank of Nigeria", endpoint: "https://example.test/ntb", origin: "network", fetchedAt: NOW, recordCount: 13 },
    });
    expect(doc.source.firstAuctionDate).toBe("2025-01-01");
    expect(doc.source.lastAuctionDate).toBe("2025-06-04");
    expect(doc.rules).toEqual(DEFAULT_RULES);
  });
  it("keeps every original CBN value, untouched, on every observation", () => {
    expect(doc.observations).toHaveLength(12);
    for (const o of doc.observations) expect(o.raw).toEqual(records.find((r) => (r as { id: number }).id === o.id));
  });
  it("keeps field assessments, the rejected record and the summary", () => {
    expect(doc.observations[0]!.quality.rate).toMatchObject({ status: "valid", presence: "published" });
    expect(doc.rejected).toHaveLength(1);
    expect(doc.rejected[0]).toMatchObject({ id: 7000, kind: "duplicate_content" });
    expect(doc.summary).toMatchObject({ sourceRecords: 13, observations: 12, rejected: 1 });
  });
  it("states that the amount unit is unconfirmed", () => {
    expect(doc.amounts.unit).toBe("unconfirmed");
    expect(doc.amounts.usagePolicy).toMatchObject({ historicalCharts: "not-allowed", totalsAndSums: "not-allowed" });
  });
  it("records where the data came from, including a local file", () => {
    expect(build(feed(6), { origin: "file", endpoint: "file:ntb.json" }).source).toMatchObject({ origin: "file", endpoint: "file:ntb.json" });
  });
  it("has null dates when no auction date can be read", () => {
    const d = build(feed(6).map((r) => ({ ...r, auctionDate: "nonsense" })));
    expect(d.source).toMatchObject({ firstAuctionDate: null, lastAuctionDate: null });
  });
});

describe("hashRecords and isUnchanged", () => {
  it("is stable for the same records and changes when any value changes", () => {
    const a = feed(8);
    expect(hashRecords(a)).toBe(hashRecords(JSON.parse(JSON.stringify(a))));
    const b = a.map((r, i) => (i === 3 ? { ...r, rate: "99.0000" } : r));
    expect(hashRecords(b)).not.toBe(hashRecords(a));
  });
  it("treats a later download of identical data as unchanged, whatever the fetch time", () => {
    const records = feed(8);
    const first = build(records, { fetchedAt: "2026-11-08T12:00:00.000Z" });
    const later = build(records, { fetchedAt: "2026-11-09T12:00:00.000Z" });
    expect(isUnchanged(later, first)).toBe(true);
  });
  it("is changed when the data changes, or when the rules version changes", () => {
    const first = build(feed(8));
    expect(isUnchanged(build(feed(9)), first)).toBe(false);
    const newRules = { ...DEFAULT_RULES, version: "9999-01-01.1" };
    const other = buildDocument({ records: feed(8), report: buildNtbQualityReport(feed(8), newRules), endpoint: "x", origin: "network", fetchedAt: NOW, rules: newRules });
    expect(isUnchanged(other, first)).toBe(false);
  });
});

describe("assertJsonSafe", () => {
  it("accepts ordinary data", () => {
    expect(() => assertJsonSafe({ a: [1, "x", null, true, { b: 2.5 }] })).not.toThrow();
  });
  it("refuses values JSON would silently change or drop", () => {
    expect(code(() => assertJsonSafe({ a: NaN }))).toBe("not_serializable");
    expect(code(() => assertJsonSafe({ a: [Infinity] }))).toBe("not_serializable");
    expect(code(() => assertJsonSafe({ a: undefined }))).toBe("not_serializable");
    expect(code(() => assertJsonSafe({ a: BigInt(10) }))).toBe("not_serializable");
    expect(code(() => assertJsonSafe({ a: () => 1 }))).toBe("not_serializable");
  });
  it("says where the problem is", () => {
    expect(() => assertJsonSafe({ rows: [{ rate: NaN }] })).toThrow(/document\.rows\[0\]\.rate/);
  });
});

describe("serializeDocument", () => {
  const doc = build(feed(10));
  const textOut = serializeDocument(doc);

  it("is valid JSON that equals the document", () => {
    expect(JSON.parse(textOut)).toEqual(JSON.parse(JSON.stringify(doc)));
  });
  it("puts each observation on its own line so a diff shows what changed", () => {
    const lines = textOut.split("\n");
    expect(lines.filter((l) => l.startsWith('    {"id":'))).toHaveLength(10);
    expect(textOut.endsWith("}\n")).toBe(true);
  });
  it("writes an empty list as []", () => {
    const empty = serializeDocument({ ...doc, rejected: [] });
    expect(empty).toContain('"rejected": []');
    expect(JSON.parse(empty).rejected).toEqual([]);
  });
  it("refuses a document that cannot be stored faithfully", () => {
    const broken = { ...doc, observations: [{ ...doc.observations[0]!, rate: NaN }] };
    expect(code(() => serializeDocument(broken))).toBe("not_serializable");
  });
  it("is read back by the same reader the next run uses", () => {
    expect(readPreviousDocument(textOut).source.contentSha256).toBe(doc.source.contentSha256);
  });
});

describe("readPreviousDocument", () => {
  it("refuses a file that is not JSON or has the wrong shape, so it is left for a person to inspect", () => {
    expect(code(() => readPreviousDocument("not json"))).toBe("previous_unreadable");
    expect(code(() => readPreviousDocument("[]"))).toBe("previous_unreadable");
    expect(code(() => readPreviousDocument('{"schemaVersion":1}'))).toBe("previous_unreadable");
    expect(code(() => readPreviousDocument("null"))).toBe("previous_unreadable");
  });
});

describe("verifyPublished", () => {
  const doc = build(feed(10));
  const written = serializeDocument(doc);
  it("accepts the file that holds the checked data", () => {
    expect(() => verifyPublished(written, doc.source.contentSha256)).not.toThrow();
  });
  it("refuses a file with different data, or one that cannot be read back", () => {
    expect(code(() => verifyPublished(written, "0".repeat(64)))).toBe("readback_mismatch");
    expect(code(() => verifyPublished(written.slice(0, 200), doc.source.contentSha256))).toBe("readback_mismatch");
  });
});

describe("writeFileAtomic", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = mkdtempSync(path.join(tmpdir(), "nidex-atomic-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("creates the folder and writes the file, leaving no temporary file", () => {
    const dir = tmp();
    const target = path.join(dir, "deep", "er", "latest.json");
    writeFileAtomic(target, "hello");
    expect(readFileSync(target, "utf8")).toBe("hello");
    expect(readdirSync(path.dirname(target))).toEqual(["latest.json"]);
  });
  it("replaces an existing file completely", () => {
    const dir = tmp();
    const target = path.join(dir, "latest.json");
    writeFileSync(target, "old");
    writeFileAtomic(target, "new");
    expect(readFileSync(target, "utf8")).toBe("new");
  });
  it("leaves the existing file untouched, and no temporary file behind, when verification fails", () => {
    const dir = tmp();
    const target = path.join(dir, "latest.json");
    writeFileSync(target, "old");
    expect(() =>
      writeFileAtomic(target, "new", () => {
        throw new PublishRefusal("readback_mismatch", "does not match");
      }),
    ).toThrow(/does not match/);
    expect(readFileSync(target, "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["latest.json"]);
  });
});