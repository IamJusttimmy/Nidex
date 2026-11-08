import { describe, expect, it, vi } from "vitest";
import { downloadText, PublishRefusal } from "../index";

const URL_OK = "https://www.cbn.gov.ng/api/GetAllSecuritiesNTB";
const sleep = async () => {};

function response(body: string, init: { status?: number; url?: string; headers?: Record<string, string> } = {}): Response {
  const res = new Response(body, { status: init.status ?? 200, headers: init.headers });
  Object.defineProperty(res, "url", { value: init.url ?? URL_OK });
  return res;
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof PublishRefusal) return e.code;
    throw e;
  }
  return "no refusal";
};

describe("downloadText", () => {
  it("returns the body of a plain 200", async () => {
    const fetchImpl = vi.fn(async () => response("[1,2]"));
    await expect(downloadText({ url: URL_OK, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })).resolves.toBe("[1,2]");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("sends a generic client name and no personal details", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      void init;
      return response("[]");
    });
    await downloadText({ url: URL_OK, fetchImpl: fetchImpl as unknown as typeof fetch, sleep });
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Nidex-data-fetcher/1.0");
    expect(JSON.stringify(headers)).not.toMatch(/@/);
  });
  it("does not retry a blocked request (403) or a missing page (404)", async () => {
    for (const status of [403, 404]) {
      const fetchImpl = vi.fn(async () => response("nope", { status }));
      expect(await codeOf(downloadText({ url: URL_OK, fetchImpl: fetchImpl as unknown as typeof fetch, sleep }))).toBe("bad_status");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it("retries a server error and then succeeds", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n < 3 ? response("busy", { status: 503 }) : response("[]")));
    await expect(downloadText({ url: URL_OK, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })).resolves.toBe("[]");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("retries a network error, then gives up with a clear refusal", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const sleeps: number[] = [];
    const code = await codeOf(downloadText({ url: URL_OK, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async (ms) => void sleeps.push(ms) }));
    expect(code).toBe("download_failed");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]); // a growing pause, none after the last attempt
  });
  it("gives up after repeated server errors", async () => {
    const fetchImpl = vi.fn(async () => response("busy", { status: 502 }));
    expect(await codeOf(downloadText({ url: URL_OK, fetchImpl: fetchImpl as unknown as typeof fetch, sleep, attempts: 2 }))).toBe("download_failed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("accepts a redirect between www and the bare domain, but refuses another site", async () => {
    const ok = vi.fn(async () => response("[]", { url: "https://cbn.gov.ng/api/GetAllSecuritiesNTB" }));
    await expect(downloadText({ url: URL_OK, fetchImpl: ok as unknown as typeof fetch, sleep })).resolves.toBe("[]");
    const other = vi.fn(async () => response("[]", { url: "https://example.com/data" }));
    expect(await codeOf(downloadText({ url: URL_OK, fetchImpl: other as unknown as typeof fetch, sleep }))).toBe("wrong_host");
  });
  it("refuses a body that is too large, by header or by content", async () => {
    const declared = vi.fn(async () => response("[]", { headers: { "content-length": "999999999" } }));
    expect(await codeOf(downloadText({ url: URL_OK, fetchImpl: declared as unknown as typeof fetch, sleep }))).toBe("too_large");
    const actual = vi.fn(async () => response("x".repeat(100)));
    expect(await codeOf(downloadText({ url: URL_OK, fetchImpl: actual as unknown as typeof fetch, sleep, maxBodyBytes: 50 }))).toBe("too_large");
  });
});