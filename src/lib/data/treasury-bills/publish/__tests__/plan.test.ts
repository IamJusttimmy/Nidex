import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../../quality";
import { planPublication, PublishRefusal, readPreviousDocument, type PlanInput } from "../index";
import { feed, NOW, SMALL, text } from "./feed";

const base = (records: unknown, over: Partial<PlanInput> = {}): PlanInput => ({
  text: typeof records === "string" ? records : text(records),
  fetchedAt: NOW,
  endpoint: "https://example.test/ntb",
  origin: "network",
  previousText: null,
  limits: SMALL,
  ...over,
});

const code = (input: PlanInput): string => {
  try {
    planPublication(input);
  } catch (e) {
    if (e instanceof PublishRefusal) return e.code;
    throw e;
  }
  return "no refusal";
};

describe("planPublication: first publish", () => {
  it("publishes a good feed when there is no previous file", () => {
    const plan = planPublication(base(feed(12)));
    expect(plan.action).toBe("publish");
    if (plan.action !== "publish") return;
    expect(plan.previous).toBeNull();
    expect(plan.document.source.recordCount).toBe(12);
    expect(JSON.parse(plan.serialized).observations).toHaveLength(12);
  });
});

describe("planPublication: refusals never produce a result", () => {
  it("refuses an empty response", () => expect(code(base(""))).toBe("empty_response"));
  it("refuses an HTML challenge page", () => expect(code(base("<html>Just a moment...</html>"))).toBe("html_response"));
  it("refuses text that is not JSON", () => expect(code(base("Forbidden"))).toBe("not_json"));
  it("refuses JSON that is not a list", () => expect(code(base('{"error":"x"}'))).toBe("not_an_array"));
  it("refuses a list that is too short", () => expect(code(base(feed(3)))).toBe("too_few_records"));
  it("refuses records with renamed fields", () => {
    expect(code(base(feed(12).map(({ rate, ...r }) => ({ ...r, taux: rate }))))).toBe("unexpected_fields");
  });
  it("refuses a feed that fails the quality limits", () => {
    expect(code(base(feed(12).map((r) => ({ ...r, auctionDate: "2025-01-01" }))))).toBe("too_many_invalid");
    expect(code(base(feed(12).map((r) => ({ ...r, securityType: "TBILL" }))))).toBe("too_many_rejected");
  });
  it("refuses when the existing published file cannot be read", () => {
    expect(code(base(feed(12), { previousText: "{ broken" }))).toBe("previous_unreadable");
  });
});

describe("planPublication: with a last good file", () => {
  const first = planPublication(base(feed(12)));
  if (first.action !== "publish") throw new Error("setup failed");
  const previousText = first.serialized;

  it("says unchanged for identical data, even on a later day, and carries the earlier fetch time", () => {
    const plan = planPublication(base(feed(12), { previousText, fetchedAt: "2026-11-09T12:00:00.000Z" }));
    expect(plan.action).toBe("unchanged");
    if (plan.action !== "unchanged") return;
    expect(plan.previous.source.fetchedAt).toBe(NOW);
  });
  it("publishes when a new auction appears", () => {
    const plan = planPublication(base(feed(13), { previousText, fetchedAt: "2026-11-09T12:00:00.000Z" }));
    expect(plan.action).toBe("publish");
    if (plan.action !== "publish") return;
    expect(plan.document.source).toMatchObject({ recordCount: 13, fetchedAt: "2026-11-09T12:00:00.000Z" });
    expect(plan.previous?.source.recordCount).toBe(12);
  });
  it("publishes when CBN corrects an existing value", () => {
    const corrected = feed(12).map((r, i) => (i === 4 ? { ...r, rate: "15.5000" } : r));
    expect(planPublication(base(corrected, { previousText })).action).toBe("publish");
  });
  it("publishes again when only the rules version changes", () => {
    const rules = { ...DEFAULT_RULES, version: "9999-01-01.1" };
    expect(planPublication(base(feed(12), { previousText, rules })).action).toBe("publish");
  });
  it("refuses a download with far fewer records than the last good file", () => {
    expect(code(base(feed(8), { previousText }))).toBe("dataset_shrunk");
  });
  it("refuses a download whose newest auction is older", () => {
    // 12 records starting a year earlier: same count, older latest auction
    expect(code(base(feed(12, "2024-01-01"), { previousText }))).toBe("latest_date_older");
  });
  it("accepts that same download when regression is explicitly allowed", () => {
    expect(planPublication(base(feed(12, "2024-01-01"), { previousText, allowRegression: true })).action).toBe("publish");
  });
  it("produces a file the next run can read as its last good file", () => {
    const plan = planPublication(base(feed(13), { previousText }));
    if (plan.action !== "publish") throw new Error("expected publish");
    expect(readPreviousDocument(plan.serialized).source.recordCount).toBe(13);
  });
});

describe("planPublication: the real limits", () => {
  it("refuses a short feed under the real limits", () => {
    expect(code({ ...base(feed(50)), limits: undefined })).toBe("too_few_records");
  });
});