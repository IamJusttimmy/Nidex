"use client";

import { useMemo, useState } from "react";
import { NtbRateChart, TENOR_STYLE } from "@/components/ntb-rate-chart";
import { NtbReview } from "@/components/ntb-review";
import { NotesSection } from "@/components/notes-section";
import type { TenorGroupDays } from "@/lib/data/treasury-bills/quality";
import { flaggedRows, ruleRows } from "@/lib/data/treasury-bills/review";
import {
  buildRateSeries,
  cutoffDate,
  defaultLabelKey,
  inRange,
  latestAuctionRows,
  RANGES,
  type RangeKey,
  type TrueYieldCell,
} from "@/lib/data/treasury-bills/series";
import { useTreasuryBills } from "@/lib/data/treasury-bills-site/use-treasury-bills";
import { formatDate, formatDateTimeUtc, formatRate } from "@/lib/format";

const CBN_URL = "https://www.cbn.gov.ng";

const count = (n: number) => n.toLocaleString("en-US");

const TENORS: TenorGroupDays[] = [91, 182, 364];

const buttonClass = (pressed: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    pressed ? "border-brand bg-brand text-paper" : "border-line bg-surface hover:bg-brand-soft"
  }`;

const badgeClass = "ml-2 rounded border border-down px-1.5 py-0.5 text-[11px] font-medium text-down";

function TrueYield({ cell }: { cell: TrueYieldCell | null }) {
  if (!cell) return <span className="text-muted">—</span>;
  if (cell.kind === "not-published") {
    return (
      <>
        <span className="text-muted">Not published</span>
        <span className="block text-xs text-muted">
          {cell.raw.trim() === "" ? "CBN left it empty" : `CBN wrote “${cell.raw.trim()}”`}
        </span>
      </>
    );
  }
  if (cell.kind === "unreadable") {
    return (
      <>
        <span className="text-muted">Unreadable</span>
        <span className="block text-xs text-muted">CBN wrote “{cell.raw.trim()}”</span>
      </>
    );
  }
  return (
    <>
      <span className="tabular-nums">{formatRate(cell.value!)}</span>
      {cell.status !== "valid" && (
        <span className={badgeClass}>{cell.status === "suspicious" ? "Flagged" : "Invalid"}</span>
      )}
      {cell.message && <span className="mt-0.5 block max-w-xs text-xs leading-snug text-muted">{cell.message}</span>}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  );
}

export function TreasuryBillsView() {
  const snapshot = useTreasuryBills();
  const doc = snapshot.data?.document;

  // Rates that passed every check, and the same series with suspicious rates included (drawn as markers, never as part of a line).
  const series = useMemo(() => (doc ? buildRateSeries(doc.observations) : null), [doc]);
  const withSuspicious = useMemo(() => (doc ? buildRateSeries(doc.observations, { includeSuspicious: true }) : null), [doc]);
  const records = useMemo(() => new Map((doc?.observations ?? []).map((o) => [o.id, o])), [doc]);
  const review = useMemo(
    () => (doc ? { rows: flaggedRows(doc.observations), rules: ruleRows(doc.summary.reasons) } : null),
    [doc],
  );

  const [labelChoice, setLabelChoice] = useState<string | null>(null);
  const [tenorChoice, setTenorChoice] = useState<TenorGroupDays | "all">("all");
  const [range, setRange] = useState<RangeKey>("1Y");
  const [showSuspicious, setShowSuspicious] = useState(false);

  // One label at a time. Until the viewer chooses, the label with the most rates is shown, and it is named.
  const activeKey = series ? (series.labels.some((l) => l.key === labelChoice) ? labelChoice : defaultLabelKey(series)) : null;
  const active = series?.labels.find((l) => l.key === activeKey);
  const activeAll = withSuspicious?.labels.find((l) => l.key === activeKey);

  const view = useMemo(() => {
    if (!active) return null;
    const cutoff = cutoffDate(range, active.lastDate);
    const shownTenors = tenorChoice === "all" ? TENORS : [tenorChoice];
    const suspiciousOf = (t: TenorGroupDays) => (activeAll?.tenors[t] ?? []).filter((p) => p.rateStatus === "suspicious");
    return {
      lines: shownTenors.map((t) => ({ tenor: t, points: inRange(active.tenors[t], cutoff) })),
      flagged: showSuspicious ? shownTenors.map((t) => ({ tenor: t, points: inRange(suspiciousOf(t), cutoff) })) : [],
      suspiciousTotal: TENORS.reduce((n, t) => n + suspiciousOf(t).length, 0),
      rows: latestAuctionRows(showSuspicious ? activeAll : active, activeAll, records),
    };
  }, [active, activeAll, range, tenorChoice, showSuspicious, records]);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex max-w-3xl flex-col gap-3">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Treasury bills</h1>
          <p className="text-[17px] leading-relaxed text-muted">
            Results of the Central Bank of Nigeria&apos;s Treasury bill auctions for the 91, 182 and
            364-day bills, shown as published.
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="Latest auction">
            {doc ? (doc.source.lastAuctionDate ? formatDate(doc.source.lastAuctionDate) : "unavailable") : "…"}
          </Fact>
          <Fact label="Data file updated">{doc ? formatDateTimeUtc(doc.source.fetchedAt) : "…"}</Fact>
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
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          The latest auction is the date of the newest auction in the data. The data file is updated when new
          results appear or when Nidex changes how it checks them; Nidex looks for new results every day, and a
          day with nothing new changes nothing.
        </p>
      </section>

      {snapshot.isLoading && <p className="text-muted">Loading the Treasury bills data…</p>}

      {snapshot.error && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5">
          <p className="text-down">
            The Treasury bills data could not be loaded ({snapshot.error.kind}): {snapshot.error.message}
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

      {doc && series && active && view && (
        <section aria-labelledby="rates-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="rates-heading" className="text-xl font-semibold tracking-tight">
                Rates
              </h2>
              <p className="text-[15px] text-muted">
                Showing the <strong className="font-semibold text-ink">{active.name}</strong> label, in percent, at each
                auction.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div role="group" aria-label="Tenor" className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={tenorChoice === "all"} onClick={() => setTenorChoice("all")} className={buttonClass(tenorChoice === "all")}>
                  All tenors
                </button>
                {TENORS.map((t) => (
                  <button key={t} type="button" aria-pressed={tenorChoice === t} onClick={() => setTenorChoice(t)} className={buttonClass(tenorChoice === t)}>
                    {TENOR_STYLE[t].name}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Date range" className="flex gap-1.5">
                {RANGES.map((r) => (
                  <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)} className={buttonClass(range === r.key)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span id="label-picker" className="text-sm font-medium">
              Rate label
            </span>
            <div role="group" aria-labelledby="label-picker" className="flex flex-wrap gap-1.5">
              {series.labels.map((l) => (
                <button key={l.key} type="button" aria-pressed={l.key === activeKey} onClick={() => setLabelChoice(l.key)} className={buttonClass(l.key === activeKey)}>
                  {l.name} <span className="font-normal opacity-80">({count(l.pointCount)})</span>
                </button>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              CBN wording on these rates: {active.rawLabels.map((r) => `“${r.text}” (${count(r.count)})`).join(", ")}. Labels are
              never combined, so each one is its own series.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {(tenorChoice === "all" ? TENORS : [tenorChoice]).map((t) => (
              <span key={t} className="flex items-center gap-2">
                <svg width="28" height="8" aria-hidden="true">
                  <path d="M0 4H28" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={TENOR_STYLE[t].legendDash} className={TENOR_STYLE[t].stroke} />
                </svg>
                {TENOR_STYLE[t].name}
              </span>
            ))}
            {showSuspicious && (
              <span className="flex items-center gap-2">
                <svg width="12" height="12" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" strokeWidth="2" className="fill-paper stroke-down" />
                </svg>
                Suspicious rate
              </span>
            )}
            {view.suspiciousTotal > 0 && (
              <label className="flex cursor-pointer items-center gap-2 sm:ml-auto">
                <input type="checkbox" checked={showSuspicious} onChange={(e) => setShowSuspicious(e.target.checked)} className="size-4 accent-brand" />
                Show suspicious rates ({view.suspiciousTotal})
              </label>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-3 sm:p-5">
            <NtbRateChart lines={view.lines} flagged={view.flagged} labelName={active.name} />
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            The lines join auctions that passed Nidex&apos;s checks; a gap between auctions is drawn as a straight line, not as
            data. Ranges count back from the newest auction of this label ({formatDate(active.lastDate)}). Hover for exact
            values and the wording CBN used.
          </p>

          <div className="flex flex-col gap-3">
            <h3 className="text-[17px] font-semibold tracking-tight">Latest auctions, {active.name} label</h3>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b border-line text-[13px] font-medium text-muted">
                    <th scope="col" className="px-3 py-3 sm:px-4">Tenor</th>
                    <th scope="col" className="px-3 py-3">Auction date</th>
                    <th scope="col" className="px-3 py-3 text-right">Rate (%)</th>
                    <th scope="col" className="px-3 py-3">True yield (%)</th>
                    <th scope="col" className="px-3 py-3 sm:px-4">Label as published</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.tenor} className="border-b border-line align-top last:border-b-0">
                      <th scope="row" className="px-3 py-3 font-semibold sm:px-4">
                        {TENOR_STYLE[r.tenor].name}
                        <span className="block text-xs font-normal text-muted">as published: {r.point.rawTenor}</span>
                      </th>
                      <td className="whitespace-nowrap px-3 py-3">{formatDate(r.point.date)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatRate(r.point.rate)}
                        {r.point.rateStatus === "suspicious" && <span className={badgeClass}>Flagged</span>}
                      </td>
                      <td className="px-3 py-3">
                        <TrueYield cell={r.trueYield} />
                      </td>
                      <td className="px-3 py-3 text-muted sm:px-4">“{r.point.rawLabel}”</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.rows.some((r) => r.newerSuspicious) && (
              <ul className="flex flex-col gap-1 text-[13px] leading-relaxed text-muted">
                {view.rows.flatMap((r) =>
                  r.newerSuspicious
                    ? [
                        <li key={r.tenor}>
                          A newer {TENOR_STYLE[r.tenor].name} rate ({formatDate(r.newerSuspicious.date)}, {formatRate(r.newerSuspicious.rate)}%) is
                          flagged as suspicious and hidden. Choose &ldquo;Show suspicious rates&rdquo; to see it.
                        </li>,
                      ]
                    : [],
                )}
              </ul>
            )}
            <p className="text-[13px] leading-relaxed text-muted">
              Each row is the newest auction of that tenor with a rate that passed the checks. The true yield is CBN&apos;s own
              figure and is shown as published; where CBN gave none, it says so and nothing is calculated in its place.
            </p>
          </div>
        </section>
      )}

      {doc && series && (
        <section aria-labelledby="labels-heading" className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-2">
            <h2 id="labels-heading" className="text-xl font-semibold tracking-tight">
              Rate labels in the data
            </h2>
            <p className="text-[15px] leading-relaxed text-muted">
              CBN publishes each rate under a label. Nidex keeps the labels apart and never combines them into
              one series. Some labels are misspelled in the CBN data; the standard name is shown here, and the
              original wording stays on every record.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[13px] font-medium text-muted">
                  <th scope="col" className="px-3 py-3.5 sm:px-6">Label</th>
                  <th scope="col" className="px-3 py-3.5 sm:px-4">Wording used by CBN</th>
                  <th scope="col" className="px-3 py-3.5 text-right sm:px-4">Auctions</th>
                  <th scope="col" className="hidden px-6 py-3.5 sm:table-cell">First to latest</th>
                </tr>
              </thead>
              <tbody>
                {series.labels.map((l) => (
                  <tr key={l.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3 py-3.5 font-semibold sm:px-6">{l.name}</th>
                    <td className="px-3 py-3.5 text-[15px] sm:px-4">
                      {l.rawLabels.map((r) => `“${r.text}” (${count(r.count)})`).join(", ")}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums sm:px-4">{count(l.pointCount)}</td>
                    <td className="hidden px-6 py-3.5 text-[13px] text-muted sm:table-cell">
                      {formatDate(l.firstDate)} to {formatDate(l.lastDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {count(series.included)} of the {count(series.considered)} auctions in the data have a published
            rate that passed every check and a standard 91, 182 or 364-day tenor. The rest are not counted
            here; each one is listed under Data quality below, with the reason.
          </p>
        </section>
      )}

      {doc && review && (
        <section aria-labelledby="quality-heading" className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-2">
            <h2 id="quality-heading" className="text-xl font-semibold tracking-tight">
              Data quality
            </h2>
            <p className="text-[15px] leading-relaxed text-muted">
              {count(doc.summary.observations)} auctions were read from {count(doc.summary.sourceRecords)} source records.{" "}
              {count(doc.summary.recordsByWorstStatus.valid)} passed every check, {count(doc.summary.recordsByWorstStatus.suspicious)}{" "}
              have a suspicious field and {count(doc.summary.recordsByWorstStatus.invalid)} have an invalid one.
              {doc.summary.rejected > 0 &&
                ` ${count(doc.summary.rejected)} source record${doc.summary.rejected === 1 ? " was" : "s were"} set aside.`}{" "}
              Nothing is corrected or deleted.
            </p>
          </div>
          <NtbReview rules={review.rules} rows={review.rows} rejected={doc.rejected} />
        </section>
      )}

      <NotesSection
        id="method-heading"
        title="How Nidex handles this data"
        notes={[
          {
            term: "Nothing is changed",
            body: "Every value is shown as CBN published it, and the original record is kept next to anything Nidex works out.",
          },
          {
            term: "Each field is checked on its own",
            body: "A problem with one field never removes the rest of an auction. Each field is marked valid, suspicious or invalid, with the reason.",
          },
          {
            term: "Missing stays missing",
            body: "Where CBN publishes 0.0000 for a value that cannot really be zero, such as a true yield, Nidex shows “Not published”. It does not calculate a replacement.",
          },
          {
            term: "Amounts are not shown yet",
            body: "The unit of the amount fields is not confirmed, and some records are on very different scales, so Nidex does not chart, add up or compare them.",
          },
          {
            term: "Three different dates",
            body: "The auction date, the date the data file was updated and the time this page checked it are separate things, and are always labelled as such.",
          },
          ...(doc
            ? [
                {
                  term: "Checking rules",
                  body: (
                    <>
                      Version <span className="font-mono text-ink">{doc.rulesVersion}</span>. Changing a rule only changes how the
                      same stored records are judged; the published values are never edited.
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />

      <NotesSection
        id="about-heading"
        title="About this data"
        notes={[
          {
            term: "What it is",
            body: "Short-term debt of the Federal Government of Nigeria. Treasury bills are sold at auction at a discount to their face value and repaid at face value when they mature. Nidex covers the 91, 182 and 364-day bills.",
          },
          {
            term: "Rate and true yield",
            body: "The rate appears to be the discount rate. CBN also publishes a true yield, the return implied by the price paid. It is higher than the discount rate, so the two should not be compared directly. Some auctions have no published true yield.",
          },
          {
            term: "Rate labels",
            body: "CBN publishes rates under the labels Issue, Marginal and Stop. Nidex does not assume they mean the same thing, so it shows one label at a time.",
          },
          {
            term: "Source",
            body: (
              <>
                Published by the <a className="text-ink underline underline-offset-2" href={CBN_URL}>Central Bank of Nigeria</a>{" "}
                through its Nigerian Treasury bills data feed. Nidex downloads it once a day, checks every record and publishes it
                unchanged next to its own assessments. Only Treasury bills are covered. A record that CBN published twice with
                identical content is kept once, and the repeat is set aside, not deleted. A failed or suspect download never
                replaces the last good data.
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
