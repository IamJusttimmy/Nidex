import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NtbObservation } from "../../quality";
import { buildRateSeries } from "../index";

/**
 * Checks that hold for ANY day's published file (no record counts, which change when CBN publishes).
 * It reads the real file the website serves, so a bad change to the series or to the data shows up here.
 */
const root = path.resolve(__dirname, "..", "..", "..", "..", "..", ".."); // __tests__ is six folders below the project root
const file = path.join(root, "public", "data", "treasury-bills", "latest.json");
const doc = JSON.parse(readFileSync(file, "utf8")) as { observations: NtbObservation[] };
const observations = doc.observations;

describe("rate series built from the published file", () => {
  it("really loaded the published observations", () => {
    expect(observations.length).toBeGreaterThan(1000);
  });

  for (const includeSuspicious of [false, true]) {
    describe(`includeSuspicious = ${includeSuspicious}`, () => {
      const set = buildRateSeries(observations, { includeSuspicious });
      const byId = new Map(observations.map((o) => [o.id, o]));
      const points = set.labels.flatMap((l) => ([91, 182, 364] as const).flatMap((t) => l.tenors[t].map((p) => ({ l, t, p }))));

      it("accounts for every observation: shown + left out = all", () => {
        expect(set.considered).toBe(observations.length);
        expect(set.included + set.excluded.total).toBe(set.considered);
        expect(points).toHaveLength(set.included);
      });

      it("every point is exactly what CBN published: same id, date, rate and original label text", () => {
        for (const { p } of points) {
          const o = byId.get(p.id)!;
          expect(p.date).toBe(o.auctionDate);
          expect(p.rate).toBe(o.rate);
          expect(p.rawLabel).toBe(o.raw.rateDescription);
          expect(p.rawTenor).toBe(o.raw.tenor);
          expect(p.displayLabel).toBe(o.rateLabel.display);
        }
      });

      it("each point sits in the tenor the checker assigned, and no observation appears twice", () => {
        const seen = new Set<number>();
        for (const { t, p } of points) {
          expect(byId.get(p.id)!.tenor.group).toBe(t);
          expect(seen.has(p.id)).toBe(false);
          seen.add(p.id);
        }
      });

      it("never shows an invalid or unpublished rate", () => {
        for (const { p } of points) {
          const q = byId.get(p.id)!.quality.rate;
          expect(q.presence).toBe("published");
          expect(q.status === "valid" || (includeSuspicious && q.status === "suspicious")).toBe(true);
        }
      });

      it("offers only labels that exist in the data, and lists every original wording exactly", () => {
        const wordingsInData = new Set(observations.map((o) => o.raw.rateDescription));
        for (const l of set.labels) {
          expect(l.pointCount).toBeGreaterThan(0);
          expect(l.rawLabels.reduce((n, r) => n + r.count, 0)).toBe(l.pointCount);
          for (const r of l.rawLabels) expect(wordingsInData.has(r.text)).toBe(true);
        }
        expect(new Set(set.labels.map((l) => l.key)).size).toBe(set.labels.length);
      });

      it("keeps different labels apart: a point under a standard option carries exactly that label", () => {
        for (const { l, p } of points) {
          if (l.kind === "standard") expect(p.displayLabel).toBe(l.key);
          else expect(p.displayLabel).toBeNull();
        }
      });
    });
  }
});