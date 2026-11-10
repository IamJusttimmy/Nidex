"use client";

import useSWR from "swr";
import type { DataFetchError } from "../errors";
import { loadTreasuryBills, NTB_DATA_URL } from "./load";
import type { TreasuryBillsDocument } from "./schema";

export interface TreasuryBillsSnapshot {
  document: TreasuryBillsDocument;
  /** When this browser downloaded and checked the file (not the date of any auction). */
  checkedAt: string;
}

/** The published Treasury bills file, checked on arrival, with the moment this page checked it. */
export function useTreasuryBills() {
  return useSWR<TreasuryBillsSnapshot, DataFetchError>(
    ["treasury-bills", NTB_DATA_URL],
    async () => {
      const document = await loadTreasuryBills();
      return { document, checkedAt: new Date().toISOString() };
    },
    { revalidateOnFocus: false },
  );
}