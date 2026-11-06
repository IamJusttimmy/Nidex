"use client";

import useSWR from "swr";
import type { DataFetchError } from "../errors";
import { loadRateHistory, RATES_CSV_URL, type RateHistory } from "./history";

/**
 * The full cleaned history. It is downloaded and checked once, then shared by every
 * page that asks for it, so moving between pages does not repeat the work.
 */
export function useRateHistory() {
  return useSWR<RateHistory, DataFetchError>(
    RATES_CSV_URL,
    (url: string) => loadRateHistory(url),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 5 * 60 * 1000,
    },
  );
}