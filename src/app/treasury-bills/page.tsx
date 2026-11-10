import type { Metadata } from "next";
import { TreasuryBillsView } from "./treasury-bills-view";

export const metadata: Metadata = {
  title: "Treasury bills | Nidex",
  description:
    "Results of the Central Bank of Nigeria's Treasury bill auctions for the 91, 182 and 364-day bills, shown as published.",
};

export default function TreasuryBillsPage() {
  return <TreasuryBillsView />;
}