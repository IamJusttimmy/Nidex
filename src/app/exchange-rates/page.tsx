import type { Metadata } from "next";
import { ExchangeRatesView } from "./exchange-rates-view";

export const metadata: Metadata = {
  title: "Exchange rates | Nidex",
  description:
    "Buying and selling rates in naira for one unit of each foreign currency, as published by the Central Bank of Nigeria.",
};

export default function ExchangeRatesPage() {
  return <ExchangeRatesView />;
}