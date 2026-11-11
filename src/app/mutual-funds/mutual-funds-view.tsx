"use client";

import { useState, useMemo } from "react";
import { useMutualFunds } from "@/lib/data/mutual-funds-site/load";
import {
  getLatestObservations,
  getCategories,
  getFundNames,
  buildFundSeries,
  MF_CHART_FIELD_OPTIONS,
  type MfChartField,
} from "@/lib/data/mutual-funds-site/series";
import type { MfObservationSite } from "@/lib/data/mutual-funds-site/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNgn(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return value.toLocaleString("en-NG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

// ── Latest rates table ────────────────────────────────────────────────────────

function NavValue({ obs }: { obs: MfObservationSite }) {
  const nav = obs.fields.navNgn;
  if (nav.status === "not-published") {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }
  if (nav.status === "suspicious") {
    return (
      <span className="text-amber-700 dark:text-amber-400" title="Nidex flagged this value as suspicious">
        {formatNgn(nav.value)} ⚑
      </span>
    );
  }
  if (nav.status === "invalid") {
    return (
      <span className="text-red-700 dark:text-red-400" title={`Invalid: ${nav.raw}`}>
        {nav.raw ?? "—"}
      </span>
    );
  }
  return <span>{formatNgn(nav.value)}</span>;
}

function PriceValue({ obs }: { obs: MfObservationSite }) {
  // 2026: show offer price; 2011: show unit price
  const field = obs.sourceFormat === "2011" ? obs.fields.unitPriceNgn : obs.fields.offerPriceNgn;
  const label = obs.sourceFormat === "2011" ? "Unit Price" : "Offer Price";
  if (field.status !== "valid" && field.status !== "suspicious") {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }
  return (
    <span title={label}>
      {formatNgn(field.value)}
      {field.status === "suspicious" && (
        <span className="text-amber-700 dark:text-amber-400"> ⚑</span>
      )}
    </span>
  );
}

function CategoryGroup({
  category,
  observations,
}: {
  category: string | null;
  observations: MfObservationSite[];
}) {
  return (
    <div className="mb-8">
      {category && (
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[var(--color-text-muted)] mb-3 px-1">
          {category}
        </h3>
      )}
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)]">Fund</th>
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)] hidden sm:table-cell">Manager</th>
              <th className="text-right px-4 py-2 font-medium text-[var(--color-text-muted)]">NAV (₦)</th>
              <th className="text-right px-4 py-2 font-medium text-[var(--color-text-muted)] hidden md:table-cell">Price (₦)</th>
              <th className="text-right px-4 py-2 font-medium text-[var(--color-text-muted)] hidden lg:table-cell">Yield YTD</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((obs, i) => (
              <tr
                key={obs.id}
                className={
                  i % 2 === 0
                    ? "bg-[var(--color-surface)]"
                    : "bg-[var(--color-surface-raised)]"
                }
              >
                <td className="px-4 py-2 font-medium">{obs.fundName}</td>
                <td className="px-4 py-2 text-[var(--color-text-muted)] hidden sm:table-cell">
                  {obs.fundManager ?? "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  <NavValue obs={obs} />
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs hidden md:table-cell">
                  <PriceValue obs={obs} />
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs hidden lg:table-cell">
                  {obs.fields.yieldYtd.status === "valid"
                    ? `${formatNumber(obs.fields.yieldYtd.value)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LatestRates({ observations }: { observations: MfObservationSite[] }) {
  const latest = useMemo(() => getLatestObservations(observations), [observations]);
  const categories = useMemo(() => getCategories(latest), [latest]);

  // Funds with a category (2026 format)
  const byCat = useMemo(() => {
    const map = new Map<string, MfObservationSite[]>();
    for (const obs of latest) {
      if (!obs.category) continue;
      const arr = map.get(obs.category) ?? [];
      arr.push(obs);
      map.set(obs.category, arr);
    }
    return map;
  }, [latest]);

  // Funds without a category (2011-only funds not in latest 2026 file)
  const uncategorised = useMemo(
    () => latest.filter((o) => !o.category),
    [latest],
  );

  const lastDate = latest[0]?.reportingDate;

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-lg font-semibold">Latest NAV</h2>
        {lastDate && (
          <span className="text-sm text-[var(--color-text-muted)]">
            as at {formatDate(lastDate)}
          </span>
        )}
      </div>

      {categories.map((cat) => (
        <CategoryGroup
          key={cat}
          category={cat}
          observations={byCat.get(cat) ?? []}
        />
      ))}

      {uncategorised.length > 0 && (
        <CategoryGroup category={null} observations={uncategorised} />
      )}
    </section>
  );
}

// ── Chart section ─────────────────────────────────────────────────────────────

function ChartSection({ observations }: { observations: MfObservationSite[] }) {
  const fundNames = useMemo(() => getFundNames(observations), [observations]);
  const [selectedFund, setSelectedFund] = useState<string>(fundNames[0] ?? "");
  const [selectedField, setSelectedField] = useState<MfChartField>("navNgn");

  const series = useMemo(
    () =>
      selectedFund
        ? buildFundSeries(observations, selectedFund, selectedField)
        : null,
    [observations, selectedFund, selectedField],
  );

  const validPoints = useMemo(
    () => series?.points.filter((p) => p.value !== null) ?? [],
    [series],
  );

  return (
    <section className="mb-12">
      <h2 className="text-lg font-semibold mb-4">Fund history</h2>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="mf-fund-select" className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
            Fund
          </label>
          <select
            id="mf-fund-select"
            value={selectedFund}
            onChange={(e) => setSelectedFund(e.target.value)}
            className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-[var(--color-surface)] min-w-[220px] max-w-xs"
          >
            {fundNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mf-field-select" className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
            Metric
          </label>
          <select
            id="mf-field-select"
            value={selectedField}
            onChange={(e) => setSelectedField(e.target.value as MfChartField)}
            className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-[var(--color-surface)]"
          >
            {MF_CHART_FIELD_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {validPoints.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No data available for this fund and metric.
        </p>
      ) : (
        <div className="text-sm text-[var(--color-text-muted)]">
          {/* Chart placeholder — wire up NtbRateChart or a d3 chart in a follow-up */}
          <p className="mb-2">
            {validPoints.length} week{validPoints.length !== 1 ? "s" : ""} of data
            from {formatDate(validPoints[0].reportingDate)} to{" "}
            {formatDate(validPoints[validPoints.length - 1].reportingDate)}.
          </p>
          <p className="italic">Chart coming soon.</p>
        </div>
      )}
    </section>
  );
}

// ── Quality section ───────────────────────────────────────────────────────────

function QualitySection({ observations }: { observations: MfObservationSite[] }) {
  const suspicious = useMemo(
    () =>
      observations.flatMap((obs) =>
        Object.entries(obs.fields)
          .filter(([, a]) => a.status === "suspicious")
          .map(([field, a]) => ({
            reportingDate: obs.reportingDate,
            fundName: obs.fundName,
            field,
            raw: a.raw,
            reason: a.reason,
          })),
      ),
    [observations],
  );

  const invalid = useMemo(
    () =>
      observations.flatMap((obs) =>
        Object.entries(obs.fields)
          .filter(([, a]) => a.status === "invalid")
          .map(([field, a]) => ({
            reportingDate: obs.reportingDate,
            fundName: obs.fundName,
            field,
            raw: a.raw,
            reason: a.reason,
          })),
      ),
    [observations],
  );

  if (suspicious.length === 0 && invalid.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-lg font-semibold mb-4">Data quality</h2>

      {suspicious.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-3">
            ⚑ Suspicious values ({suspicious.length})
          </h3>
          <div className="space-y-1">
            {suspicious.map((item, i) => (
              <div key={i} className="text-sm font-mono flex gap-3">
                <span className="text-[var(--color-text-muted)] w-28 shrink-0">{formatDate(item.reportingDate)}</span>
                <span className="text-[var(--color-text-muted)] shrink-0">{item.field}</span>
                <span className="font-medium">{item.raw ?? "—"}</span>
                <span className="text-[var(--color-text-muted)]">({item.reason})</span>
                <span className="truncate">{item.fundName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {invalid.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-700 dark:text-red-400 mb-3">
            Invalid values ({invalid.length})
          </h3>
          <div className="space-y-1">
            {invalid.map((item, i) => (
              <div key={i} className="text-sm font-mono flex gap-3">
                <span className="text-[var(--color-text-muted)] w-28 shrink-0">{formatDate(item.reportingDate)}</span>
                <span className="text-[var(--color-text-muted)] shrink-0">{item.field}</span>
                <span className="font-medium">{item.raw ?? "—"}</span>
                <span className="truncate">{item.fundName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <section className="mb-12 text-sm text-[var(--color-text-muted)] space-y-3 max-w-2xl">
      <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">About this data</h2>
      <p>
        <strong className="text-[var(--color-text)]">Source.</strong>{" "}
        Securities and Exchange Commission of Nigeria (SEC), weekly NAV archive for
        Collective Investment Schemes (CIS). Published every Friday.
      </p>
      <p>
        <strong className="text-[var(--color-text)]">Coverage.</strong>{" "}
        Files are available from 2011. Each weekly file covers all funds registered
        with the SEC at that date. The number of funds grows over time as new schemes
        are registered.
      </p>
      <p>
        <strong className="text-[var(--color-text)]">Format changes.</strong>{" "}
        Files from 2011 contain only NAV (₦) and unit price (₦) for each fund, with
        no category groupings. Later files (2026 format) add fund manager, category,
        USD NAV, bid and offer prices, unitholders, and weekly and year-to-date yields.
        Nidex preserves both formats and marks which fields are absent for older data.
      </p>
      <p>
        <strong className="text-[var(--color-text)]">Data preservation.</strong>{" "}
        Nidex reproduces what the SEC published. Where a value is zero or appears
        inconsistent, it is flagged as suspicious rather than removed. The original
        published figure is always shown.
      </p>
      <p>
        <strong className="text-[var(--color-text)]">Update frequency.</strong>{" "}
        The pipeline checks for a new file each weekday morning and adds the new week
        when found. If the SEC corrects or replaces a weekly file, that week&apos;s
        records are refreshed on the next run.
      </p>
    </section>
  );
}

// ── Root view ─────────────────────────────────────────────────────────────────

export function MutualFundsView() {
  const { data, error, isLoading } = useMutualFunds();

  if (isLoading) {
    return (
      <div className="px-4 py-16 text-center text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 py-16 text-center text-sm text-red-600">
        Could not load mutual funds data.
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold mb-2">Mutual Funds</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Weekly NAV and pricing for collective investment schemes in Nigeria.
        </p>
      </div>

      <LatestRates observations={data.observations} />
      <ChartSection observations={data.observations} />
      <QualitySection observations={data.observations} />
      <AboutSection />
    </main>
  );
}