"use client";

import { listCurrencies } from "@/lib/data/exchange-rates/currencies";
import { useLatestRates, useRatesMeta } from "@/lib/data/exchange-rates/hooks";

export default function DebugPage() {
  const latest = useLatestRates();
  const meta = useRatesMeta();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Data layer check</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">meta.json</h2>
        {meta.isLoading && <p className="text-muted">Loading…</p>}
        {meta.error && (
          <p className="text-down">Unavailable: {meta.error.message}</p>
        )}
        {meta.data && (
          <p className="font-mono text-sm">
            built {meta.data.generated_at} · {meta.data.rates_rows} rows ·{" "}
            {meta.data.first_date} to {meta.data.last_date}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">latest.json</h2>
        {latest.isLoading && <p className="text-muted">Loading…</p>}
        {latest.error && (
          <p className="text-down">Unavailable: {latest.error.message}</p>
        )}
        {latest.data && (
          <>
            <p className="font-mono text-sm">as of {latest.data.as_of}</p>
            <ul className="font-mono text-sm">
              {listCurrencies(latest.data).map((c) => (
                <li key={c.code}>
                  {c.code} · {c.name} · buy {c.buy} · sell {c.sell} · {c.date}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}