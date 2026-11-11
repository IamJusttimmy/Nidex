import type { Metadata } from "next";
import { MutualFundsView } from "./mutual-funds-view";

export const metadata: Metadata = {
  title: "Mutual Funds — Nidex",
  description:
    "Weekly net asset value and pricing data for collective investment schemes in Nigeria, sourced from the Securities and Exchange Commission.",
};

export default function MutualFundsPage() {
  return <MutualFundsView />;
}