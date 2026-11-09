import { fetchValidated } from "../fetch-validated";
import { treasuryBillsSchema, type TreasuryBillsDocument } from "./schema";

/**
 * Where the website reads the published Treasury bills file. The path is relative, so it works in the
 * browser (client components) but not in server code, which would need a full address.
 */
export const NTB_DATA_URL = "/data/treasury-bills/latest.json";

/** Downloads the published file and checks it. Failures become typed DataFetchErrors; bad data is never returned. */
export function loadTreasuryBills(url: string = NTB_DATA_URL): Promise<TreasuryBillsDocument> {
  return fetchValidated(url, treasuryBillsSchema);
}