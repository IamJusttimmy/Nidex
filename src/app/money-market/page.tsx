import type { Metadata } from "next";
import { MoneyMarketView } from "./money-market-view";

export const metadata: Metadata = {
  title: "Money market",
  description:
    "Nigerian money market indicators from the Central Bank of Nigeria — " +
    "policy rate, interbank rate, deposit rates and lending rates, January 2006 to present.",
};

export default function MoneyMarketPage() {
  return <MoneyMarketView />;
}