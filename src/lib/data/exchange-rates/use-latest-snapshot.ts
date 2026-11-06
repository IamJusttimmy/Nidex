"use client";

import useSWR from "swr";
import type { DataFetchError } from "../errors";
import { fetchValidated } from "../fetch-validated";
import { RATES_BASE_URL } from "../sources";
import { latestSchema, type Latest } from "./schemas";

export interface LatestSnapshot {
  latest: Latest;
  /** When this browser downloaded and checked the file (not the date of any rate). */
  checkedAt: string;
}

/** The latest rate per currency, with the moment we checked it. */
export function useLatestSnapshot() {
  return useSWR<LatestSnapshot, DataFetchError>(
    ["latest-snapshot", RATES_BASE_URL],
    async () => {
      const latest = await fetchValidated(`${RATES_BASE_URL}/latest.json`, latestSchema);
      return { latest, checkedAt: new Date().toISOString() };
    },
    { revalidateOnFocus: false },
  );
}