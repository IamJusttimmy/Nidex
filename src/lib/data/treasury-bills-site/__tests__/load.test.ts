import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataFetchError } from "../../errors";
import { SCHEMA_VERSION } from "../../treasury-bills/publish";
import { buildRateSeries } from "../../treasury-bills/series";
import { loadTreasuryBills, NTB_DATA_URL, treasuryBillsSchema } from "../index";

const root = path.resolve(__dirname, "..", "..", "..", "..", ".."); // __tests__ is five folders below the project root
const text = readFileSync(path.join(root, "public", "data", "treasury-bills", "latest.json"), "utf8");

function respond(body: string, init: ResponseInit = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200, ...init })));
}

afterEach(() => vi.unstubAllGlobals());

async function failure(promise: Promise<unknown>): Promise<DataFetchError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(DataFetchError);
    return e as DataFetchError;
  }
  throw new Error("expected the load to fail");
}

describe("loadTreasuryBills", () => {
  it("reads the real published file from the path the workflow writes to", async () => {
    respond(text);
    const doc = await loadTreasuryBills();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(NTB_DATA_URL);
    expect(NTB_DATA_URL).toBe("/data/treasury-bills/latest.json");
    expect(doc.dataset).toBe("treasury-bills-ntb");
    expect(doc.observations.length).toBeGreaterThan(1000);
  });

  it("returns observations the rate series accepts, and leaves extra fields in place", async () => {
    respond(text);
    const doc = await loadTreasuryBills();
    const set = buildRateSeries(doc.observations);
    expect(set.labels.length).toBeGreaterThan(0);
    expect(set.included + set.excluded.total).toBe(doc.observations.length);
    expect(doc.observations[0]).toHaveProperty("raw"); // not stripped
  });

  it("expects the same schema version the publisher writes", () => {
    expect(JSON.parse(text).schemaVersion).toBe(SCHEMA_VERSION);
    expect(treasuryBillsSchema.shape.schemaVersion.value).toBe(SCHEMA_VERSION);
  });

  it("fails as 'network' when the file cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect((await failure(loadTreasuryBills())).kind).toBe("network");
  });

  it("fails as 'http' for a missing file", async () => {
    respond("Not found", { status: 404 });
    expect((await failure(loadTreasuryBills())).kind).toBe("http");
  });

  it("fails as 'parse' for something that is not JSON (an error page, for example)", async () => {
    respond("<html><body>Just a moment...</body></html>");
    expect((await failure(loadTreasuryBills())).kind).toBe("parse");
  });

  describe("fails as 'validation' (and returns nothing) for a file with the wrong shape", () => {
    interface Editable {
      schemaVersion: unknown;
      dataset: unknown;
      observations?: {
        auctionDate: unknown;
        rate: unknown;
        tenor: { group: unknown };
        rateLabel: { raw?: unknown };
        quality: { rate?: { status: unknown } };
      }[];
      amounts: { unit: unknown };
      source: { fetchedAt: unknown };
    }
    const base = () => JSON.parse(text) as Editable;
    const cases: Record<string, (d: Editable) => void> = {
      "a newer schema version": (d) => (d.schemaVersion = 2),
      "a different dataset": (d) => (d.dataset = "something-else"),
      "no observations list": (d) => delete d.observations,
      "a rate that is text": (d) => (d.observations![0]!.rate = "15.4"),
      "a date that is not ISO": (d) => (d.observations![0]!.auctionDate = "March-04-2026"),
      "a tenor group of 120": (d) => (d.observations![0]!.tenor.group = 120),
      "a missing rate assessment": (d) => delete d.observations![0]!.quality.rate,
      "an unknown quality status": (d) => (d.observations![0]!.quality.rate!.status = "fine"),
      "a label with no raw text": (d) => delete d.observations![0]!.rateLabel.raw,
      "a confirmed amount unit": (d) => (d.amounts.unit = "millions-of-naira"),
      "an unreadable fetch time": (d) => (d.source.fetchedAt = "yesterday"),
    };
    for (const [name, damage] of Object.entries(cases)) {
      it(name, async () => {
        const d = base();
        damage(d);
        respond(JSON.stringify(d));
        expect((await failure(loadTreasuryBills())).kind).toBe("validation");
      });
    }
  });
});