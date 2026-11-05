"use client";

import useSWR from "swr";
import { fetchValidated } from "../fetch-validated";
import { RATES_BASE_URL } from "../sources";
import { latestSchema, metaSchema } from "./schemas";

const options = { revalidateOnFocus: false } as const;

export function useLatestRates() {
  return useSWR(
    `${RATES_BASE_URL}/latest.json`,
    (url: string) => fetchValidated(url, latestSchema),
    options,
  );
}

export function useRatesMeta() {
  return useSWR(
    `${RATES_BASE_URL}/meta.json`,
    (url: string) => fetchValidated(url, metaSchema),
    options,
  );
}