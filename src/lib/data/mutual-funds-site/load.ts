import useSWRImmutable from "swr/immutable";
import { fetchValidated } from "../fetch-validated";
import type { DataFetchError } from "../errors";
import { mutualFundsSchema, type MutualFundsDocument } from "./schema";

export const MF_DATA_URL = "/data/mutual-funds/latest.json";

export function useMutualFunds() {
  return useSWRImmutable<MutualFundsDocument, DataFetchError>(
    MF_DATA_URL,
    (url: string) => fetchValidated(url, mutualFundsSchema),
  );
}
