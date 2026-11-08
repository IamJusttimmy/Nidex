import type { RawNtbRecord } from "../../quality";
import { series91 } from "../../quality/__tests__/helpers";
import { PUBLISH_LIMITS, type PublishLimits } from "../limits";

/** Small limits so tests can use a short feed. The real limits are tested separately. */
export const SMALL: PublishLimits = { ...PUBLISH_LIMITS, minRecords: 5 };

/** A clean feed of n auctions, a fortnight apart, with gently varying rates (no spikes). */
export function feed(n: number, startIso = "2025-01-01"): RawNtbRecord[] {
  return series91(Array.from({ length: n }, (_, i) => 15 + Math.sin(i / 5)), startIso);
}

export const text = (records: unknown): string => JSON.stringify(records);

export const NOW = "2026-11-08T12:00:00.000Z";