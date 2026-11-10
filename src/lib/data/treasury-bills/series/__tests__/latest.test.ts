import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NtbObservation } from "../../quality";
import { classify } from "../../quality/__tests__/helpers";
import { buildRateSeries, latestAuctionRows, trueYieldCell, type LatestObservation } from "../index";

const byId = (os: NtbObservation[]): Map<number, LatestObservation> => new Map(os.map((o) => [o.id, o]));

describe("trueYieldCell", () => {
  it("shows a published, valid true yield as a value", () => {
    const o = classify({ trueYield: "16.0149" });
    expect(trueYieldCell(o)).toEqual({ kind: "value", value: 16.0149, raw: "16.0149", status: "valid", message: null });
  });

  it("shows 0.0000 as 'not published' and keeps CBN's own text", () => {
    const c = trueYieldCell(classify({ trueYield: "0.0000" }));
    expect(c).toMatchObject({ kind: "not-published", value: null, raw: "0.0000" });
  });

  it("treats an empty true yield as not published too", () => {
    expect(trueYieldCell(classify({ trueYield: "" }))).toMatchObject({ kind: "not-published", value: null, raw: "" });
  });

  it("shows an unreadable true yield as unreadable, with the text as written", () => {
    expect(trueYieldCell(classify({ trueYield: "n/a" }))).toMatchObject({ kind: "unreadable", value: null, raw: "n/a" });
  });

  it("still shows the number when the checker questions it, and says why", () => {
    const c = trueYieldCell(classify({ trueYield: "20.0000" })); // far from what the 15.4 rate implies
    expect(c.kind).toBe("value");
    expect(c.value).toBe(20);
    expect(c.status).toBe("suspicious");
    expect(c.message).toBeTruthy();
  });

  it("never calculates a yield: a missing one stays missing even when the rate is there", () => {
    const o = classify({ rate: "15.4000", trueYield: "0.0000" });
    expect(o.rate).toBe(15.4);
    expect(trueYieldCell(o).value).toBeNull();
  });
});

describe("latestAuctionRows", () => {
  const all = [
    classify({ id: 1, auctionDate: "March-04-2026", rate: "15.0000", trueYield: "15.6000" }),
    classify({ id: 2, auctionDate: "March-11-2026", maturityDate: "June-10-2026", rate: "15.4000", trueYield: "0.0000" }),
    classify({ id: 3, tenor: "364DAY", auctionDate: "March-11-2026", maturityDate: "March-10-2027", rate: "18.0000", rangeBid: "17.0000 - 19.0000", successfulBidRates: "17.5000 - 18.0000", trueYield: "21.9000" }),
  ];
  const shown = buildRateSeries(all).labels[0]!;

  it("gives the newest auction per tenor, in tenor order, skipping tenors with none", () => {
    const rows = latestAuctionRows(shown, undefined, byId(all));
    expect(rows.map((r) => [r.tenor, r.point.id, r.point.date])).toEqual([
      [91, 2, "2026-03-11"],
      [364, 3, "2026-03-11"],
    ]);
  });

  it("carries the rate and label exactly as published, and the true yield cell", () => {
    const [r91] = latestAuctionRows(shown, undefined, byId(all));
    expect(r91!.point).toMatchObject({ rate: 15.4, rawLabel: "Issue", rawTenor: "91DAY" });
    expect(r91!.trueYield).toMatchObject({ kind: "not-published", raw: "0.0000" });
  });

  it("returns nothing when there is no series", () => {
    expect(latestAuctionRows(undefined, undefined, byId(all))).toEqual([]);
  });

  it("flags a newer suspicious rate that is hidden, and not when it is shown", () => {
    const sus = classify({ id: 9, auctionDate: "March-18-2026", maturityDate: "June-17-2026", rate: "20.0000" });
    const records = [...all, sus];
    const hiddenSet = buildRateSeries(records).labels[0]!;
    const withSus = buildRateSeries(records, { includeSuspicious: true }).labels[0]!;
    const hidden = latestAuctionRows(hiddenSet, withSus, byId(records));
    expect(hidden[0]!.point.id).toBe(2);
    expect(hidden[0]!.newerSuspicious).toMatchObject({ id: 9, date: "2026-03-18", rate: 20 });
    const visible = latestAuctionRows(withSus, withSus, byId(records));
    expect(visible[0]!.point.id).toBe(9);
    expect(visible[0]!.newerSuspicious).toBeNull();
  });

  it("does not call an older suspicious rate 'newer'", () => {
    const sus = classify({ id: 9, auctionDate: "February-25-2026", maturityDate: "May-27-2026", rate: "20.0000" });
    const records = [...all, sus];
    const rows = latestAuctionRows(buildRateSeries(records).labels[0], buildRateSeries(records, { includeSuspicious: true }).labels[0], byId(records));
    expect(rows[0]!.newerSuspicious).toBeNull();
  });
});

describe("latest auctions from the published file", () => {
  const root = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
  const doc = JSON.parse(readFileSync(path.join(root, "public", "data", "treasury-bills", "latest.json"), "utf8")) as { observations: NtbObservation[] };
  const ids = byId(doc.observations);
  const set = buildRateSeries(doc.observations);

  it("for every label and tenor, the row is the newest shown point", () => {
    for (const label of set.labels) {
      for (const row of latestAuctionRows(label, undefined, ids)) {
        const points = label.tenors[row.tenor];
        expect(row.point.date).toBe(points.map((p) => p.date).sort().at(-1));
      }
    }
  });

  it("every 0.0000 true yield in the file is 'not published': no number, CBN's text kept", () => {
    let zeros = 0;
    for (const o of doc.observations) {
      const cell = trueYieldCell(o);
      expect(cell.raw).toBe(o.raw.trueYield);
      if (/^0+(\.0+)?$/.test(o.raw.trueYield.trim())) {
        zeros++;
        expect(cell.kind).toBe("not-published");
        expect(cell.value).toBeNull();
      }
    }
    expect(zeros).toBeGreaterThan(0);
  });

  it("a row never shows a number that CBN did not publish", () => {
    for (const label of set.labels) {
      for (const row of latestAuctionRows(label, undefined, ids)) {
        const o = ids.get(row.point.id)!;
        expect(row.trueYield!.value).toBe(row.trueYield!.kind === "value" ? o.trueYield : null);
      }
    }
  });
});