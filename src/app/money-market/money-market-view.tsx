"use client";

import { useState, useMemo } from "react";
import { useMoneyMarket } from "@/lib/data/money-market-site";
import { buildMmSeries, MM_CHART_OPTIONS, type MmSeriesKey } from "@/lib/data/money-market-site/series";
import { NtbRateChart } from "@/components/ntb-rate-chart";
import { NotesSection } from "@/components/notes-section";
import type { MmRateField } from "@/lib/data/money-market/quality/types";
import type { MmObservation } from "@/lib/data/money-market/pipeline/types";
import type { RateSeriesPoint } from "@/lib/data/treasury-bills/series";

// ---------------------------------------------------------------------------
// Indicator groups for the latest-rates table
// ---------------------------------------------------------------------------

type IndicatorGroup = {
  heading: string;
  fields: (MmRateField | "_policy_divider")[];
};

const GROUPS: IndicatorGroup[] = [
  {
    heading: "Monetary Policy",
    fields: ["mpr", "mrr"],
  },
  {
    heading: "Money Market",
    fields: ["interBankCallRate", "treasuryBill"],
  },
  {
    heading: "Deposit Rates",
    fields: ["savingsDeposit", "oneMonthDeposit", "threeMonthsDeposit", "sixMonthsDeposit", "twelveMonthsDeposit"],
  },
  {
    heading: "Lending Rates",
    fields: ["primeLending", "maxLending"],
  },
];

const FIELD_LABELS: Record<MmRateField, string> = {
  mpr:                 "Monetary Policy Rate",
  mrr:                 "Minimum Rediscount Rate",
  interBankCallRate:   "Interbank Call Rate",
  treasuryBill:        "Treasury Bill Rate (money market)",
  savingsDeposit:      "Savings Deposit Rate",
  oneMonthDeposit:     "1-Month Deposit Rate",
  threeMonthsDeposit:  "3-Month Deposit Rate",
  sixMonthsDeposit:    "6-Month Deposit Rate",
  twelveMonthsDeposit: "12-Month Deposit Rate",
  primeLending:        "Prime Lending Rate",
  maxLending:          "Maximum Lending Rate",
};

const MRR_NOTE = "Replaced by MPR (Dec 2006)";

// ---------------------------------------------------------------------------
// Latest rates display
// ---------------------------------------------------------------------------

function LatestRates({ obs }: { obs: MmObservation }) {
  return (
    <section aria-labelledby="latest-heading" className="flex flex-col gap-8">
      <h2 id="latest-heading" className="text-xl font-semibold tracking-tight">
        Latest rates
        <span className="ml-2 text-sm font-normal text-muted">
          {obs.periodLabel}
        </span>
      </h2>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-1">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
              {group.heading}
            </p>
            {group.fields.map((field) => {
              const a = obs.rates[field as MmRateField];
              const isNotPublished = a.status === "not-published";
              const isSuspicious   = a.status === "suspicious";
              const isMrr = field === "mrr";

              return (
                <div
                  key={field}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0"
                >
                  <span className="text-[13px] text-muted">
                    {FIELD_LABELS[field as MmRateField]}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums">
                    {isNotPublished ? (
                      <span className="text-muted" title={isMrr ? MRR_NOTE : undefined}>
                        —{isMrr && <span className="ml-1 text-[11px]">legacy</span>}
                      </span>
                    ) : (
                      <span className={isSuspicious ? "text-amber-600" : undefined}>
                        {a.value?.toFixed(2)}%
                        {isSuspicious && (
                          <span
                            className="ml-1 text-[11px]"
                            title="This value was published as 0.00 and may be a data entry omission."
                          >
                            ⚑
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chart section
// ---------------------------------------------------------------------------

function ChartSection({ observations }: { observations: MmObservation[] }) {
  const [selectedKey, setSelectedKey] = useState<MmSeriesKey>("policy");

  const series = useMemo(
    () => buildMmSeries(observations, selectedKey),
    [observations, selectedKey],
  );

  // Adapt monthly money-market values to the chart's rate-series point shape.
  const chartData = useMemo(
    () => {
      const points: RateSeriesPoint[] = series.points.flatMap((p, index) =>
        p.value === null
          ? []
          : [{
              id: index,
              date: `${p.period}-01`,
              rate: p.value,
              rawLabel: series.label,
              displayLabel: series.label,
              rawTenor: "Money-market series",
              rateStatus: p.suspicious ? "suspicious" : "valid",
              rateReasons: p.suspicious
                ? [{ code: "rate_implausible", message: "Nidex flagged this money-market rate as suspicious." }]
                : [],
              warnings: [],
            }],
      );

      return {
        lines: [{ tenor: 364 as const, points: points.filter((p) => p.rateStatus === "valid") }],
        flagged: [{ tenor: 364 as const, points: points.filter((p) => p.rateStatus === "suspicious") }],
      };
    },
    [series],
  );

  return (
    <section aria-labelledby="chart-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="chart-heading" className="text-xl font-semibold tracking-tight">
          Rate history
        </h2>

        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted">Indicator</span>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value as MmSeriesKey)}
            className="rounded border border-line bg-paper px-2 py-1 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {MM_CHART_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <NtbRateChart
        lines={chartData.lines}
        flagged={chartData.flagged}
        labelName={series.label}
      />

      {series.note && (
        <p className="text-[13px] leading-relaxed text-muted">{series.note}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quality section
// ---------------------------------------------------------------------------

function QualitySection({ observations }: { observations: MmObservation[] }) {
  const suspicious = useMemo(
    () =>
      observations.flatMap((obs) =>
        Object.entries(obs.rates)
          .filter(([, a]) => a.status === "suspicious")
          .map(([field, a]) => ({
            period:      obs.period,
            periodLabel: obs.periodLabel,
            field:       field as MmRateField,
            raw:         a.raw,
          })),
      ),
    [observations],
  );

  if (suspicious.length === 0) return null;

  const fieldCount = new Set(suspicious.map((s) => s.field)).size;

  return (
    <section aria-labelledby="quality-heading" className="flex flex-col gap-4">
      <h2 id="quality-heading" className="text-xl font-semibold tracking-tight">
        Data quality
      </h2>
      <p className="text-[15px] text-muted">
        {suspicious.length} observation{suspicious.length !== 1 ? "s" : ""} across{" "}
        {fieldCount} field{fieldCount !== 1 ? "s" : ""} have a suspicious value published
        as{" "}
        <span className="font-mono">0.00</span>. The original CBN values are preserved.
      </p>

      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {suspicious.map((s) => (
          <li
            key={`${s.period}-${s.field}`}
            className="grid grid-cols-[6rem_minmax(0,1fr)_4rem] gap-4 py-3 text-[13px]"
          >
            <span className="font-mono text-muted">{s.period}</span>
            <span>{FIELD_LABELS[s.field]}</span>
            <span className="font-mono tabular-nums text-amber-600">{s.raw}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// About section
// ---------------------------------------------------------------------------

const ABOUT_NOTES = [
  {
    term: "Source",
    body: (
      <>
        Central Bank of Nigeria (CBN) Money Market Indicators endpoint. Nidex reads
        this data server-side on a daily schedule and publishes the result. The
        frontend never contacts CBN directly.
      </>
    ),
  },
  {
    term: "Frequency",
    body: "CBN publishes monthly observations. Each record represents one calendar month.",
  },
  {
    term: "Coverage",
    body: "January 2006 to the most recently published month.",
  },
  {
    term: "Policy rate transition",
    body: (
      <>
        The Minimum Rediscount Rate (MRR) was the CBN benchmark rate until November
        2006. The Monetary Policy Rate (MPR) replaced it from December 2006. The two
        rates are not directly comparable, but the chart combines them into a single
        policy-rate series to show the full history without a gap.
      </>
    ),
  },
  {
    term: "Treasury Bill Rate (money market)",
    body: (
      <>
        The T-bill rate shown here is a CBN money market indicator — a summary figure
        for the period. It is a separate number from the individual auction rates
        published on the{" "}
        <a href="/treasury-bills" className="underline underline-offset-2">
          Treasury Bills
        </a>{" "}
        page.
      </>
    ),
  },
  {
    term: "Data preservation",
    body: "Nidex does not correct, interpolate or remove CBN-published values. Suspicious observations are flagged but the original value is always shown.",
  },
];

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function MoneyMarketView() {
  const { data, error, isLoading } = useMoneyMarket();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-12">
        <div className="h-8 w-48 animate-pulse rounded bg-line" />
        <div className="h-64 animate-pulse rounded bg-line" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-[15px] text-muted">
        Could not load money market data. Please try again later.
      </p>
    );
  }

  const latest = data.observations[data.observations.length - 1];

  const retrievedDate = new Date(data.source.retrievedAt).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <div className="flex flex-col gap-16">
      {/* Page header */}
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Money market</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
          Nigerian money market indicators published by the Central Bank of Nigeria.
          Monthly observations from January 2006 to{" "}
          {latest.periodLabel}.
        </p>
        <div className="flex flex-wrap gap-4 text-[13px] text-muted">
          <span>Updated {retrievedDate}</span>
          <span>
            Coverage {data.coverage.firstPeriod} – {data.coverage.lastPeriod}
          </span>
        </div>
      </div>

      <LatestRates obs={latest} />

      <ChartSection observations={data.observations} />

      <QualitySection observations={data.observations} />

      <NotesSection
        id="about-heading"
        title="About this data"
        notes={ABOUT_NOTES}
      />
    </div>
  );
}