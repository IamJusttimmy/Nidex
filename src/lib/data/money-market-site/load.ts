import useSWRImmutable from "swr/immutable";
import { moneyMarketSchema, type MoneyMarketDocument } from "./schema";

export const MM_DATA_URL = "/data/money-market/latest.json";

async function fetcher(url: string): Promise<MoneyMarketDocument> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const json = await res.json();
  return moneyMarketSchema.parse(json);
}

export function useMoneyMarket() {
  return useSWRImmutable<MoneyMarketDocument, Error>(MM_DATA_URL, fetcher);
}