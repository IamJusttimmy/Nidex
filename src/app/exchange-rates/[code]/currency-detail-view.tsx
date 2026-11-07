"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FlaggedRecords } from "@/components/flagged-records";
import { RateChart, type SeriesChoice } from "@/components/rate-chart";
import { useRatesMeta } from "@/lib/data/exchange-rates/hooks";
import { buildChartSeries } from "@/lib/data/exchange-rates/quality";
import {
  cutoffFor,
  inRange,
  latestValues,
  RANGES,
  recentRows,
  summarize,
  type RangeKey,
} from "@/lib/data/exchange-rates/series";
import { useLatestSnapshot } from "@/lib/data/exchange-rates/use-latest-snapshot";
import { useRateHistory } from "@/lib/data/exchange-rates/use-rate-history";
import { formatDate, formatDateTimeUtc, formatPercent, formatRate, formatSigned } from "@/lib/format";

const CBN_URL = "https://www.cbn.gov.ng/rates/ExchRateByCurrency.html";
const REPO_URL = "https://github.com/bukunmialuko/cbn-rates";

const SERIES_BUTTONS: { key: SeriesChoice; label: string }[] = [
  { key: "both", label: "Both" },
  { key: "buy", label: "Buying" },
  { key: "sell", label: "Selling" },
];

const buttonClass = (pressed: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    pressed ? "border-brand bg-brand text-paper" : "border-line bg-surface hover:bg-brand-soft"
  }`;

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums ${tone ?? ""}`}>{value}</span>
      {note && <span className="text-[13px] text-muted">{note}</span>}
    </div>
  );
}

export function CurrencyDetailView({ code }: { code: string }) {
  const history = useRateHistory();
  const snapshot = useLatestSnapshot();
  const meta = useRatesMeta();

  const [series, setSeries] = useState<SeriesChoice>("both");
  const [range, setRange] = useState<RangeKey>("1Y");
  const [showFlagged, setShowFlagged] = useState(false);

  const observations = useMemo(
    () => (history.data ? history.data.report.observations.filter((o) => o.code === code) : []),
    [history.data, code],
  );

  const view = useMemo(() => {
    if (observations.length === 0) return null;
    const result = latestValues(observations);
    const lastDate = result.latest?.date ?? observations[observations.length - 1].date;
    const cutoff = cutoffFor(range, lastDate);
    const pick = (field: "buy" | "sell", flagged: boolean) => {
      const all = buildChartSeries(observations, field, { showFlagged: flagged });
      return inRange(flagged ? all.filter((p) => p.status === "suspicious") : all, cutoff);
    };
    const flaggedAll = {
      buy: buildChartSeries(observations, "buy", { showFlagged: true }).filter((p) => p.status === "suspicious"),
      sell: buildChartSeries(observations, "sell", { showFlagged: true }).filter((p) => p.status === "suspicious"),
    };
    return {
      ...result,
      buy: pick("buy", false),
      sell: pick("sell", false),
      flaggedBuy: pick("buy", true),
      flaggedSell: pick("sell", true),
      flaggedCount: new Set([...flaggedAll.buy, ...flaggedAll.sell].map((p) => p.date)).size,
      summary: summarize(observations),
      recent: recentRows(observations, 8),
      cutoff,
    };
  }, [observations, range]);

  const name = snapshot.data?.latest.rates[code]?.name ?? code;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted">
          <Link href="/exchange-rates" className="underline underline-offset-3">
            Exchange rates
          </Link>
          <span aria-hidden="true">/</span>
          <span>{name}</span>
        </nav>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">{name}</h1>
          <span className="font-mono text-sm text-muted">
            {code} · naira per 1 {name}
          </span>
        </div>
      </section>

      {history.isLoading && (
        <p className="text-muted">
          Downloading and checking the full history. This takes a few seconds the first time.
        </p>
      )}

      {history.error && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5">
          <p className="text-down">
            The history could not be loaded ({history.error.kind}): {history.error.message}
          </p>
          <button
            type="button"
            onClick={() => history.mutate()}
            className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-soft"
          >
            Try again
          </button>
        </div>
      )}

      {history.data && !view && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5">
          <p className="text-[15px]">
            There is no exchange-rate data for <span className="font-mono">{code}</span>.
          </p>
          <Link href="/exchange-rates" className="text-sm font-medium text-brand underline underline-offset-3">
            Back to all currencies
          </Link>
        </div>
      )}

      {history.data && view && (
        <>
          <section aria-label="Latest values" className="flex flex-col gap-3">
            {view.latest ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <Stat label="Buying rate" value={formatRate(view.latest.buy)} />
                <Stat label="Selling rate" value={formatRate(view.latest.sell)} />
                <Stat
                  label="Change in buying rate"
                  value={view.latest.buyChange === null ? "—" : formatSigned(view.latest.buyChange)}
                  note={
                    view.latest.buyChangePct === null
                      ? undefined
                      : `${formatPercent(view.latest.buyChangePct)} since ${formatDate(view.latest.previousDate!)}`
                  }
                  tone={
                    view.latest.buyChange === null || view.latest.buyChange === 0
                      ? ""
                      : view.latest.buyChange > 0
                        ? "text-brand"
                        : "text-down"
                  }
                />
                <Stat
                  label="Spread (selling minus buying)"
                  value={formatRate(view.latest.spread)}
                  note={`as of ${formatDate(view.latest.date)}`}
                />
              </div>
            ) : (
              <p className="text-[15px] text-muted">No value for this currency passed the checks.</p>
            )}
            {view.newerFlagged && (
              <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
                The newest publication ({formatDate(view.newerFlagged.date)}) is flagged, so the figures above
                are from the latest value that passed the checks. See Flagged records below.
              </p>
            )}
          </section>

          <section aria-labelledby="history-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="history-heading" className="text-xl font-semibold tracking-tight">
                History
              </h2>
              <div className="flex flex-wrap gap-3">
                <div role="group" aria-label="Series" className="flex gap-1.5">
                  {SERIES_BUTTONS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      aria-pressed={series === b.key}
                      onClick={() => setSeries(b.key)}
                      className={buttonClass(series === b.key)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <div role="group" aria-label="Date range" className="flex gap-1.5">
                  {RANGES.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={range === r.key}
                      onClick={() => setRange(r.key)}
                      className={buttonClass(range === r.key)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                <svg width="28" height="8" aria-hidden="true">
                  <path d="M0 4H28" strokeWidth="2.5" className="stroke-brand" />
                </svg>
                Buying rate
              </span>
              <span className="flex items-center gap-2">
                <svg width="28" height="8" aria-hidden="true">
                  <path d="M0 4H28" strokeWidth="2.5" strokeDasharray="6 4" className="stroke-olive" />
                </svg>
                Selling rate
              </span>
              {showFlagged && (
                <span className="flex items-center gap-2">
                  <svg width="12" height="12" aria-hidden="true">
                    <circle cx="6" cy="6" r="4.5" strokeWidth="2" className="fill-paper stroke-down" />
                  </svg>
                  Suspicious value
                </span>
              )}
              <label className="flex cursor-pointer items-center gap-2 sm:ml-auto">
                <input
                  type="checkbox"
                  checked={showFlagged}
                  onChange={(e) => setShowFlagged(e.target.checked)}
                  className="size-4 accent-brand"
                />
                Show suspicious values on the chart ({view.flaggedCount})
              </label>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3 sm:p-5">
              <RateChart
                buy={view.buy}
                sell={view.sell}
                flaggedBuy={showFlagged ? view.flaggedBuy : []}
                flaggedSell={showFlagged ? view.flaggedSell : []}
                series={series}
                label={name}
              />
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              The buying and selling rates are usually close together, so the two lines overlap over long
              ranges. Choose 1M or 3M to see the gap, or hover for exact values. The chart shows only values
              that passed Nidex&apos;s checks.
            </p>
          </section>

          <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
            <section aria-labelledby="recent-heading" className="flex min-w-0 flex-col gap-3">
              <h2 id="recent-heading" className="text-xl font-semibold tracking-tight">
                Recent values
              </h2>
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full border-collapse text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-line text-[13px] font-medium text-muted">
                      <th scope="col" className="px-3 py-3 sm:px-4">Date</th>
                      <th scope="col" className="px-2 py-3 text-right sm:px-3">Buying (₦)</th>
                      <th scope="col" className="px-2 py-3 text-right sm:px-3">Selling (₦)</th>
                      <th scope="col" className="px-3 py-3 text-right sm:px-4">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.recent.map((r) => (
                      <tr key={r.date} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                          {formatDate(r.date)}
                          {r.flagged && (
                            <span className="ml-2 rounded border border-down px-1.5 py-0.5 text-[11px] font-medium text-down">
                              Flagged
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums sm:px-3">{formatRate(r.buy)}</td>
                        <td className="px-2 py-3 text-right tabular-nums sm:px-3">{formatRate(r.sell)}</td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums sm:px-4 ${
                            r.buyChange === null || r.buyChange === 0
                              ? "text-muted"
                              : r.buyChange > 0
                                ? "text-brand"
                                : "text-down"
                          }`}
                        >
                          {r.buyChange === null ? "—" : formatSigned(r.buyChange)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="summary-heading" className="flex min-w-0 flex-col gap-3">
              <h2 id="summary-heading" className="text-xl font-semibold tracking-tight">
                Summary
              </h2>
              <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-5">
                <div>
                  <dt className="text-[13px] text-muted">Highest buying rate</dt>
                  <dd className="font-semibold tabular-nums">{view.summary.high ? formatRate(view.summary.high.value) : "—"}</dd>
                  <dd className="text-[13px] text-muted">{view.summary.high ? formatDate(view.summary.high.date) : ""}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Lowest buying rate</dt>
                  <dd className="font-semibold tabular-nums">{view.summary.low ? formatRate(view.summary.low.value) : "—"}</dd>
                  <dd className="text-[13px] text-muted">{view.summary.low ? formatDate(view.summary.low.date) : ""}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Data since</dt>
                  <dd className="font-semibold">{view.summary.since ? formatDate(view.summary.since) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Observations</dt>
                  <dd className="font-semibold tabular-nums">{view.summary.total.toLocaleString("en-US")}</dd>
                  <dd className="text-[13px] text-muted">
                    {view.summary.valid.toLocaleString("en-US")} passed all checks
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <FlaggedRecords observations={observations} />

          <section aria-labelledby="about-heading" className="flex flex-col gap-4">
            <h2 id="about-heading" className="text-xl font-semibold tracking-tight">
              About this data
            </h2>
            <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">What this is</h3>
                <p className="text-[15px] leading-relaxed text-muted">
                  On business days the CBN publishes a buying rate and a selling rate for {name}. Each is the
                  number of naira for one {name}. These are published CBN rates, not quotes from banks or
                  bureaux de change.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">How Nidex checks it</h3>
                <p className="text-sm leading-relaxed text-muted">
                  Every published value is checked for a buying rate above the selling rate, a value that
                  jumps and then returns, and a midpoint that does not fit the buying and selling rates.{" "}
                  {view.summary.suspicious + view.summary.invalid === 0
                    ? "No observation for this currency is flagged. "
                    : `${view.summary.invalid} observation${view.summary.invalid === 1 ? "" : "s"} for this currency ${view.summary.invalid === 1 ? "is" : "are"} flagged invalid and ${view.summary.suspicious} suspicious. `}
                  Nothing is corrected or deleted, and the flagged values are listed above with the reason.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">Source and freshness</h3>
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[13px] text-muted">Publisher</dt>
                    <dd><a className="underline underline-offset-2" href={CBN_URL}>Central Bank of Nigeria, exchange rates</a></dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">Prepared by</dt>
                    <dd><a className="underline underline-offset-2" href={REPO_URL}>cbn-rates</a>, rebuilt twice a day</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">Latest observation</dt>
                    <dd className="font-mono">{view.latest ? formatDate(view.latest.date) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">Dataset last built</dt>
                    <dd className="font-mono">{meta.data ? formatDateTimeUtc(meta.data.generated_at) : "…"}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">Checked by this page</dt>
                    <dd className="font-mono">{formatDateTimeUtc(history.data.fetchedAt)}</dd>
                  </div>
                </dl>
                <p className="text-[13px] leading-relaxed text-muted">
                  The cbn-rates project removed some records before Nidex receives the data (identical
                  duplicates and conflicting entries) and does not keep the original CBN downloads, so those
                  cannot be checked here.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}