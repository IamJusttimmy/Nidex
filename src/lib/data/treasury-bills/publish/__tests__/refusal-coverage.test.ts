import { describe, expect, it } from "vitest";
import { buildNtbQualityReport } from "../../quality";
import {
  assertJsonSafe,
  buildDocument,
  checkNotRegressing,
  checkQuality,
  checkStructure,
  downloadText,
  parseResponseBody,
  PublishRefusal,
  readPreviousDocument,
  REFUSAL_CODES,
  serializeDocument,
  verifyPublished,
  type RefusalCode,
} from "../index";
import { feed, NOW, SMALL } from "./feed";

const reply = (body: string, status = 200, url = "https://www.cbn.gov.ng/x", headers: Record<string, string> = {}) => {
  const res = new Response(body, { status, headers });
  Object.defineProperty(res, "url", { value: url });
  return res;
};
const fetcher = (make: () => Promise<Response>) => ({ url: "https://www.cbn.gov.ng/x", fetchImpl: make as unknown as typeof fetch, sleep: async () => {}, attempts: 2 });

/**
 * Every way of refusing must be shown to happen. Typed with Record<RefusalCode, ...>, so a new refusal code
 * without a trigger here is a compile error.
 */
const TRIGGERS: Record<RefusalCode, () => unknown | Promise<unknown>> = {
  download_failed: () => downloadText(fetcher(async () => { throw new Error("offline"); })),
  bad_status: () => downloadText(fetcher(async () => reply("blocked", 403))),
  wrong_host: () => downloadText(fetcher(async () => reply("[]", 200, "https://elsewhere.example/x"))),
  too_large: () => downloadText({ ...fetcher(async () => reply("x".repeat(20))), maxBodyBytes: 10 }),
  empty_response: () => parseResponseBody(""),
  html_response: () => parseResponseBody("<html></html>"),
  not_json: () => parseResponseBody("oops"),
  not_an_array: () => parseResponseBody("{}"),
  too_few_records: () => checkStructure(feed(2), { ...SMALL, minRecords: 10 }),
  unexpected_fields: () => checkStructure(feed(10).map(({ id }) => ({ id })), SMALL),
  too_many_rejected: () => checkQuality(buildNtbQualityReport(feed(10).map((r) => ({ ...r, securityType: "X" }))), SMALL),
  too_many_invalid: () => checkQuality(buildNtbQualityReport(feed(10).map((r) => ({ ...r, auctionDate: "x" }))), SMALL),
  previous_unreadable: () => readPreviousDocument("{"),
  dataset_shrunk: () => checkNotRegressing({ recordCount: 1, lastAuctionDate: "2026-01-01" }, { recordCount: 100, lastAuctionDate: "2026-01-01" }),
  latest_date_older: () => checkNotRegressing({ recordCount: 100, lastAuctionDate: "2025-01-01" }, { recordCount: 100, lastAuctionDate: "2026-01-01" }),
  not_serializable: () => assertJsonSafe({ a: NaN }),
  readback_mismatch: () => verifyPublished(serializeDocument(buildDocument({ records: feed(10), report: buildNtbQualityReport(feed(10)), endpoint: "x", origin: "file", fetchedAt: NOW })), "not-the-real-hash"),
};

describe("every way of refusing is exercised", () => {
  it.each(REFUSAL_CODES)("%s", async (code) => {
    let thrown: unknown = null;
    try {
      await TRIGGERS[code]();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PublishRefusal);
    expect((thrown as PublishRefusal).code).toBe(code);
    expect((thrown as PublishRefusal).message.length).toBeGreaterThan(10);
  });
});