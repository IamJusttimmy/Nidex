"use client";

import { useMemo } from "react";
import { useRateHistory } from "@/lib/data/exchange-rates/use-rate-history";
import { buildChartSeries } from "@/lib/data/exchange-rates/quality";

/** Temporary page to prove the history download and quality checks work in the browser. */
export default function HistoryDebugPage() {
  const { data, error, isLoading } = useRateHistory();

  const summary = useMemo(() => {
    if (!data) return null;
    const obs = data.report.observations;
    const worst = (o: (typeof obs)[number]) => {
      const s = [o.quality.buy.status, o.quality.mid.status, o.quality.sell.status, o.quality.quotePair.status];
      return s.includes("invalid") ? "invalid" : s.includes("suspicious") ? "suspicious" : "valid";
    };
    const counts = { valid: 0, suspicious: 0, invalid: 0 };
    for (const o of obs) counts[worst(o)]++;
    const usd = obs.filter((o) => o.code === "USD");
    return {
      counts,
      usdBuyDefault: buildChartSeries(usd, "buy").length,
      usdBuyWithFlagged: buildChartSeries(usd, "buy", { showFlagged: true }).length,
      usdTotal: usd.length,
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">History check</h1>

      {isLoading && <p className="text-muted">Downloading and checking the history…</p>}
      {error && (
        <p className="text-down">
          Unavailable ({error.kind}): {error.message}
        </p>
      )}

      {data && summary && (
        <section className="flex flex-col gap-2 font-mono text-sm">
          <p>checked {data.fetchedAt}</p>
          <p>
            download {data.timings.fetchMs} ms · checking {data.timings.processMs} ms · file{" "}
            {(data.rawCsv.length / 1_000_000).toFixed(2)} MB
          </p>
          <p>
            source rows {data.report.sourceRowCount} · observations {data.report.observations.length} ·
            rejected {data.report.rejected.length}
          </p>
          <p>
            valid {summary.counts.valid} · suspicious {summary.counts.suspicious} · invalid{" "}
            {summary.counts.invalid}
          </p>
          <p>
            USD buy line: {summary.usdBuyDefault} points by default, {summary.usdBuyWithFlagged} with flagged
            shown, of {summary.usdTotal} published
          </p>
        </section>
      )}
    </div>
  );
}