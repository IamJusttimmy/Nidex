import { describe, it, expect } from "vitest";
import { mergeObservations, buildDocument } from "../build";
import type { MfObservation } from "../types";

function makeObs(
  reportingDate: string,
  fundName: string,
  overrides: Partial<MfObservation> = {},
): MfObservation {
  const absent = {
    raw: null, value: null, status: "not-published" as const, reason: "field_absent_for_format" as const,
  };
  return {
    id: `${reportingDate}__${fundName.toLowerCase().replace(/\s+/g, "_")}`,
    reportingDate,
    fundName,
    fundManager: null,
    category: null,
    fields: {
      navNgn:        { raw: "1000000", value: 1000000, status: "valid", reason: null },
      navUsd:        absent,
      unitPriceNgn:  absent,
      offerPriceNgn: absent,
      offerPriceUsd: absent,
      bidPriceNgn:   absent,
      bidPriceUsd:   absent,
      unitholders:   absent,
      yieldWtd:      absent,
      yieldYtd:      absent,
    },
    sourceFile: "test.xlsx",
    sourceFormat: "2011",
    ...overrides,
  };
}

describe("mergeObservations", () => {
  it("adds new observations to an empty set", () => {
    const incoming = [makeObs("2026-10-23", "Fund A")];
    expect(mergeObservations([], incoming)).toHaveLength(1);
  });

  it("keeps existing observations for dates not in the incoming set", () => {
    const existing = [makeObs("2026-10-16", "Fund A")];
    const incoming = [makeObs("2026-10-23", "Fund A")];
    const result = mergeObservations(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it("replaces ALL existing records for a date present in the incoming set", () => {
    const existing = [
      makeObs("2026-10-23", "Fund A"),
      makeObs("2026-10-23", "Fund B"),
    ];
    // Incoming has only Fund A — Fund B for that date should be dropped
    const incoming = [makeObs("2026-10-23", "Fund A")];
    const result = mergeObservations(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].fundName).toBe("Fund A");
  });

  it("returns existing unchanged when incoming is empty", () => {
    const existing = [makeObs("2026-10-23", "Fund A")];
    expect(mergeObservations(existing, [])).toEqual(existing);
  });
});

describe("buildDocument", () => {
  it("sorts observations by reportingDate then fundName", () => {
    const obs = [
      makeObs("2026-10-23", "Zenith Fund"),
      makeObs("2026-10-16", "ARM Fund"),
      makeObs("2026-10-23", "ARM Fund"),
    ];
    const doc = buildDocument(obs, "2026-11-12T00:00:00.000Z");
    expect(doc.observations[0].reportingDate).toBe("2026-10-16");
    expect(doc.observations[1].fundName).toBe("ARM Fund");
    expect(doc.observations[2].fundName).toBe("Zenith Fund");
  });

  it("computes quality summary totals correctly", () => {
    const obs = [makeObs("2026-10-23", "Fund A"), makeObs("2026-10-23", "Fund B")];
    const doc = buildDocument(obs, "2026-11-12T00:00:00.000Z");
    // 2 observations × 10 fields = 20 total field assessments
    expect(doc.quality.total).toBe(2);
    expect(doc.quality.weekCount).toBe(1);
    expect(doc.quality.fundCount).toBe(2);
    expect(doc.quality.lastReportingDate).toBe("2026-10-23");
  });

  it("sets schemaVersion to 1", () => {
    const doc = buildDocument([], "2026-11-12T00:00:00.000Z");
    expect(doc.schemaVersion).toBe("1");
  });
});