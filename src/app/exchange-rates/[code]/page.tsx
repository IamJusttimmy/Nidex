import type { Metadata } from "next";
import { Suspense } from "react";
import { CurrencyDetailView } from "./currency-detail-view";

export const metadata: Metadata = {
  title: "Currency exchange rate | Nidex",
  description:
    "Buying and selling rate history in naira for one foreign currency, as published by the Central Bank of Nigeria, with Nidex's data-quality checks shown.",
};

async function CurrencyContent({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CurrencyDetailView code={code.toUpperCase()} />;
}

export default function CurrencyPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <CurrencyContent params={params} />
    </Suspense>
  );
}