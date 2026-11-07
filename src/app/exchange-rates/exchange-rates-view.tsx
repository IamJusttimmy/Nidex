"use client";

import Link from "next/link";
import { useState } from "react";
import { AboutData } from "@/components/about-data";
import { listCurrencies } from "@/lib/data/exchange-rates/currencies";
import { useRatesMeta } from "@/lib/data/exchange-rates/hooks";
import { useLatestSnapshot } from "@/lib/data/exchange-rates/use-latest-snapshot";
import { formatDate, formatDateTimeUtc, formatRate } from "@/lib/format";

const CBN_URL = "https://www.cbn.gov.ng/rates/ExchRateByCurrency.html";
const REPO_URL = "https://github.com/bukunmialuko/cbn-rates";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  );
}

export function ExchangeRatesView() {
  const snapshot = useLatestSnapshot();
  const meta = useRatesMeta();
  const [query, setQuery] = useState("");

  const currencies = snapshot.data ? listCurrencies(snapshot.data.latest) : [];
  const q = query.trim().toLowerCase();
  const shown = q
    ? currencies.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q))
    : currencies;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex max-w-3xl flex-col gap-3">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Exchange rates</h1>
          <p className="text-[17px] leading-relaxed text-muted">
            Buying and selling rates in naira for one unit of each foreign currency, as published by
            the Central Bank of Nigeria.
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="Latest observation">
            {snapshot.data ? formatDate(snapshot.data.latest.as_of) : "…"}
          </Fact>
          <Fact label="Dataset last built">
            {meta.data ? formatDateTimeUtc(meta.data.generated_at) : meta.error ? "unavailable" : "…"}
          </Fact>
          <Fact label="Checked by this page">
            {snapshot.data ? formatDateTimeUtc(snapshot.data.checkedAt) : "…"}
          </Fact>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[13px] text-muted">Publisher</dt>
            <dd className="text-sm">
              <a className="underline underline-offset-3" href={CBN_URL}>
                Central Bank of Nigeria
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="rates-heading" className="flex flex-col gap-4">
        <h2 id="rates-heading" className="sr-only">
          Currencies
        </h2>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex max-w-md flex-1 basis-80 flex-col gap-1.5">
            <label htmlFor="currency-filter" className="text-sm font-medium">
              Filter currencies
            </label>
            <input
              id="currency-filter"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="USD, euro, franc…"
              autoComplete="off"
              className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>
          <p className="text-sm text-muted" aria-live="polite">
            {snapshot.data ? `${shown.length} of ${currencies.length} currencies` : ""}
          </p>
        </div>

        {snapshot.isLoading && <p className="text-muted">Loading the latest rates…</p>}

        {snapshot.error && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5">
            <p className="text-down">
              The latest rates could not be loaded ({snapshot.error.kind}): {snapshot.error.message}
            </p>
            <button
              type="button"
              onClick={() => snapshot.mutate()}
              className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-soft"
            >
              Try again
            </button>
          </div>
        )}

        {snapshot.data && (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[13px] font-medium text-muted">
                  <th scope="col" className="px-3 py-3.5 sm:px-6">Currency</th>
                  <th scope="col" className="px-3 py-3.5 text-right sm:px-4">Buying (₦)</th>
                  <th scope="col" className="px-3 py-3.5 text-right sm:px-4">Selling (₦)</th>
                  <th scope="col" className="hidden px-6 py-3.5 sm:table-cell">As of</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.code} className="border-b border-line last:border-b-0 hover:bg-brand-soft/60">
                    <th scope="row" className="px-3 py-3.5 font-normal sm:px-6">
                      <Link
                        href={`/exchange-rates/${c.code}`}
                        className="font-semibold underline-offset-3 hover:underline"
                      >
                        {c.name}
                      </Link>{" "}
                      <span className="ml-1 font-mono text-xs text-muted sm:ml-2">{c.code}</span>
                      <span className="mt-0.5 block text-xs text-muted sm:hidden">
                        {formatDate(c.date)}
                      </span>
                    </th>
                    <td className="px-3 py-3.5 text-right tabular-nums sm:px-4">{formatRate(c.buy)}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums sm:px-4">{formatRate(c.sell)}</td>
                    <td className="hidden px-6 py-3.5 text-[13px] text-muted sm:table-cell">
                      {formatDate(c.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="px-6 py-5 text-[15px] text-muted">No currency matches that filter.</p>
            )}
          </div>
        )}

        <p className="text-[13px] leading-relaxed text-muted">
          Values are shown to 2 decimals from ₦100 up and 4 decimals below, rounded from the
          published 4 decimals. Each row shows its own observation date; a currency can be a day
          behind the others.
        </p>
      </section>

      <AboutData
        cards={[
          {
            title: "What this is",
            body: "On business days the CBN publishes a table of naira rates for a set of currencies: a buying rate, a selling rate and a central rate between them. Nidex shows the buying and selling rates.",
          },
          {
            title: "How to read it",
            body: "Each rate is the number of naira for one unit of the currency. The selling rate is normally slightly above the buying rate, and the gap between them is the spread. XDR is the IMF's Special Drawing Right and XUA is the unit labelled WAUA by the CBN.",
          },
          {
            title: "Good to know",
            body: "These are published CBN rates, not quotes from banks or bureaux de change, so what you are offered elsewhere can differ. The CBN labels its table “Weighted Average Rate – Nigerian Foreign Exchange Market (NFEM)”.",
          },
        ]}
        source={
          <>
            Published by the <a className="underline underline-offset-2" href={CBN_URL}>Central Bank of Nigeria</a>.
            Prepared into files by the open-source{" "}
            <a className="underline underline-offset-2" href={REPO_URL}>cbn-rates</a> project, which
            rebuilds its data twice a day; the rates remain the CBN&apos;s. That project also removed
            some records before we receive the data (identical duplicates and conflicting entries),
            and the original CBN downloads are not kept, so Nidex cannot check those. This table
            shows the latest published value for each currency as prepared by that project. The
            charts on each currency page use the full history, where Nidex checks every value:
            suspicious values are hidden by default and can be shown, and clearly broken ones are
            listed with the reason. Nothing is corrected or deleted. Codes with no clear currency
            are left out.
          </>
        }
      />
    </div>
  );
}