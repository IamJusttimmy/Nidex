import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { moneyMarketSchema } from "../schema";

const DATA_PATH = resolve(process.cwd(), "public/data/money-market/latest.json");

describe("moneyMarketSchema", () => {
  it("accepts the real latest.json file", () => {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    expect(() => moneyMarketSchema.parse(raw)).not.toThrow();
  });

  it("requires at least one observation", () => {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    const damaged = { ...raw, observations: [] };
    expect(() => moneyMarketSchema.parse(damaged)).toThrow();
  });

  it("requires period to match YYYY-MM format", () => {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    const damaged = {
      ...raw,
      observations: [{ ...raw.observations[0], period: "September 2026" }],
    };
    expect(() => moneyMarketSchema.parse(damaged)).toThrow();
  });

  it("rejects an unknown quality status", () => {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    const obs = structuredClone(raw.observations[0]);
    obs.rates.mpr.status = "unknown-status";
    const damaged = { ...raw, observations: [obs] };
    expect(() => moneyMarketSchema.parse(damaged)).toThrow();
  });

  it("rejects a missing coverage block", () => {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    const { coverage: _, ...damaged } = raw;
    expect(() => moneyMarketSchema.parse(damaged)).toThrow();
  });

  it("rejects a negative quality count", () => {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    const damaged = { ...raw, quality: { ...raw.quality, fullyValid: -1 } };
    expect(() => moneyMarketSchema.parse(damaged)).toThrow();
  });
});