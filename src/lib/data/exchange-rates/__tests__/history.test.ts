import { afterEach, describe, expect, it, vi } from "vitest";
import { DataFetchError } from "../../errors";
import { loadRateHistory } from "../history";

const CSV = [
  "date,code,buy,mid,sell",
  "2024-01-01,USD,1000,1000.5,1001",
  "2024-01-02,USD,1001,1001.5,1002",
  "2024-01-03,USD,1002,1002.5,1003",
].join("\n") + "\n";

const URL = "https://example.test/rates.csv";

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

async function failure(promise: Promise<unknown>): Promise<DataFetchError> {
  try {
    await promise;
  } catch (e) {
    return e as DataFetchError;
  }
  throw new Error("expected a rejection");
}

describe("loadRateHistory", () => {
  it("returns the classified report and the original text untouched", async () => {
    stubFetch(async () => new Response(CSV, { status: 200 }));
    const h = await loadRateHistory(URL);
    expect(h.rawCsv).toBe(CSV);
    expect(h.report.observations).toHaveLength(3);
    expect(h.report.sourceRowCount).toBe(3);
    expect(new Date(h.fetchedAt).toISOString()).toBe(h.fetchedAt);
    expect(h.timings.fetchMs).toBeGreaterThanOrEqual(0);
    expect(h.timings.processMs).toBeGreaterThanOrEqual(0);
  });

  it("reports a bad HTTP status as kind 'http'", async () => {
    stubFetch(async () => new Response("nope", { status: 404 }));
    const e = await failure(loadRateHistory(URL));
    expect(e).toBeInstanceOf(DataFetchError);
    expect(e.kind).toBe("http");
    expect(e.message).toContain("404");
  });

  it("reports an unreachable source as kind 'network'", async () => {
    stubFetch(async () => {
      throw new TypeError("failed to fetch");
    });
    expect((await failure(loadRateHistory(URL))).kind).toBe("network");
  });

  it("reports a page that is not a rates CSV (for example HTML with status 200) as kind 'parse'", async () => {
    stubFetch(async () => new Response("<html><body>Not found</body></html>", { status: 200 }));
    expect((await failure(loadRateHistory(URL))).kind).toBe("parse");
  });

  it("reports an empty file as kind 'parse'", async () => {
    stubFetch(async () => new Response("", { status: 200 }));
    expect((await failure(loadRateHistory(URL))).kind).toBe("parse");
  });

  it("reports a header with no usable rows as kind 'validation'", async () => {
    stubFetch(async () => new Response("date,code,buy,mid,sell\n", { status: 200 }));
    expect((await failure(loadRateHistory(URL))).kind).toBe("validation");
  });
});