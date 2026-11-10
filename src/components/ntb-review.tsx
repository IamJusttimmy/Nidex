"use client";

import { useMemo, useState } from "react";
import { FIELD_LABELS, NTB_FIELDS, REJECTION_TITLES, type NtbField, type RejectionKind } from "@/lib/data/treasury-bills/quality";
import {
  filterRows,
  reviewCounts,
  type ChartStatus,
  type ReviewFilter,
  type ReviewLevel,
  type ReviewRow,
  type RuleRow,
} from "@/lib/data/treasury-bills/review";
import { formatDate } from "@/lib/format";

interface Rejected {
  index: number;
  id: number | null;
  kind: RejectionKind;
  message: string;
  raw?: unknown;
}

interface Props {
  rules: RuleRow[];
  rows: ReviewRow[];
  rejected: Rejected[];
}

const PAGE = 25;
const count = (n: number) => n.toLocaleString("en-US");

const LEVEL_WORDS: Record<ReviewLevel | "note", string> = {
  invalid: "Invalid",
  suspicious: "Suspicious",
  "not-published": "No rate",
  note: "Note",
};

const LEVEL_TONE: Record<ReviewLevel | "note", string> = {
  invalid: "border-down text-down",
  suspicious: "border-olive text-olive",
  "not-published": "border-line text-muted",
  note: "border-line text-muted",
};

const CHART_WORDS: Record<ChartStatus, string> = {
  "on-chart": "Yes",
  "only-with-suspicious": "Only if suspicious rates are shown",
  "off-chart": "No",
};

const buttonClass = (pressed: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    pressed ? "border-brand bg-brand text-paper" : "border-line bg-surface hover:bg-brand-soft"
  }`;

function Badge({ level }: { level: ReviewLevel | "note" }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_TONE[level]}`}>{LEVEL_WORDS[level]}</span>
  );
}

const detailsClass = "py-1";
const summaryClass = "cursor-pointer py-3 text-[15px] font-semibold";
const bodyClass = "flex flex-col gap-4 pb-5 pt-1";

/**
 * Everything the checker questioned, in three expandable parts: the rules that fired (with how many auctions each
 * touched), the auctions themselves with CBN's original values, and the source records that were set aside.
 * Nothing here is corrected, and nothing is hidden: every part opens.
 */
export function NtbReview({ rules, rows, rejected }: Props) {
  const [filter, setFilter] = useState<ReviewFilter>({ level: "all", field: "all" });
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => reviewCounts(rows), [rows]);
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const visible = filtered.slice(0, shown);

  const choose = (next: Partial<ReviewFilter>) => {
    setFilter((f) => ({ ...f, ...next }));
    setShown(PAGE);
  };

  const levels: { key: ReviewFilter["level"]; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.total },
    { key: "invalid", label: "Invalid", n: counts.byLevel.invalid },
    { key: "suspicious", label: "Suspicious", n: counts.byLevel.suspicious },
    { key: "not-published", label: "No rate", n: counts.byLevel["not-published"] },
  ];
  const fieldsWithFlags = NTB_FIELDS.filter((f) => counts.byField[f] > 0);

  return (
    <div className="flex flex-col divide-y divide-line border-y border-line">
      <details className={detailsClass}>
        <summary className={summaryClass}>Rules that fired ({rules.length})</summary>
        <div className={bodyClass}>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">
            Each rule is listed with the number of auctions it touched. A &ldquo;note&rdquo; means the rule fired but the
            field stayed valid, for example when a label spelling was standardised.
          </p>
          <div className="hidden grid-cols-[9rem_minmax(0,1fr)_6rem_5rem_13rem] gap-x-4 border-b border-line pb-2 text-[13px] font-medium text-muted md:grid">
            <span>Field</span>
            <span>Rule</span>
            <span>Result</span>
            <span className="text-right">Auctions</span>
            <span>First to latest</span>
          </div>
          <ul>
            {rules.map((r) => (
              <li
                key={`${r.field}-${r.code}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-line py-2.5 text-sm last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)_6rem_5rem_13rem] md:items-start"
              >
                <span className="font-medium md:order-1">{r.fieldLabel}</span>
                <span className="col-span-2 row-start-2 md:order-2 md:col-span-1 md:row-start-auto">{r.title}</span>
                <span className="justify-self-end md:order-3 md:justify-self-start">
                  <Badge level={r.result} />
                </span>
                <span className="col-span-2 text-[13px] tabular-nums text-muted md:order-4 md:col-span-1 md:text-right md:text-sm md:text-ink">
                  <span className="md:hidden">Auctions: </span>
                  {count(r.records)}
                </span>
                <span className="col-span-2 text-[13px] text-muted md:order-5 md:col-span-1">
                  {r.firstDate && r.lastDate ? `${formatDate(r.firstDate)} to ${formatDate(r.lastDate)}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className={detailsClass}>
        <summary className={summaryClass}>Flagged and off-chart auctions ({count(counts.total)})</summary>
        <div className={bodyClass}>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">
            Every auction with a field the checker questioned, or with no rate on the chart ({count(counts.offChart)}). Values are
            exactly as CBN published them. A flag on any field other than the rate never takes a valid rate off the chart; the last
            column says what happens to each auction.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Level" className="flex flex-wrap gap-1.5">
              {levels.map((l) => (
                <button key={l.key} type="button" aria-pressed={filter.level === l.key} onClick={() => choose({ level: l.key })} className={buttonClass(filter.level === l.key)}>
                  {l.label} <span className="font-normal opacity-80">({count(l.n)})</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              Field
              <select
                value={filter.field}
                onChange={(e) => choose({ field: e.target.value as NtbField | "all" })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">All fields</option>
                {fieldsWithFlags.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABELS[f]} ({count(counts.byField[f])})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="hidden grid-cols-[9rem_8rem_minmax(0,1fr)_9rem] gap-x-4 border-b border-line pb-2 text-[13px] font-medium text-muted md:grid">
            <span>Auction</span>
            <span>As published</span>
            <span>What was found</span>
            <span>On the rate chart</span>
          </div>
          <ul>
            {visible.map((r) => {
              const seen = new Set<string>();
              return (
                <li
                  key={r.id}
                  className="grid gap-x-4 gap-y-2 border-b border-line py-3 text-sm last:border-b-0 md:grid-cols-[9rem_8rem_minmax(0,1fr)_9rem]"
                >
                  <div>
                    {r.date ? formatDate(r.date) : <span className="text-muted">Date unreadable</span>}
                    <span className="block text-xs text-muted">record {r.id}</span>
                  </div>
                  <div className="text-muted">
                    <span className="whitespace-nowrap">{r.rawTenor}</span> <span>“{r.rawLabel}”</span>
                    {!r.date && <span className="block text-xs">date: “{r.rawDate}”</span>}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {r.fields.map((f) => (
                      <li key={f.field} className="leading-snug">
                        <span className="font-medium">{f.label}</span> <Badge level={f.level} />{" "}
                        <span className="break-all font-mono text-xs">“{f.rawText.trim()}”</span>
                        {f.isAmount && <span className="ml-1 text-xs text-muted">(unit unconfirmed)</span>}
                        {f.reasons.map((reason) => {
                          const again = seen.has(reason.message);
                          seen.add(reason.message);
                          return (
                            <span key={reason.code} className="mt-0.5 block text-[13px] text-muted">
                              {again ? "Same reason as above." : reason.message}
                            </span>
                          );
                        })}
                      </li>
                    ))}
                    {r.fields.length === 0 && <li className="text-muted">No field is flagged.</li>}
                  </ul>
                  <div className="text-muted">
                    <span className="md:hidden">On the rate chart: </span>
                    {CHART_WORDS[r.chart]}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>
              Showing {count(visible.length)} of {count(filtered.length)}
            </span>
            {visible.length < filtered.length && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-soft">
                Show {Math.min(PAGE, filtered.length - visible.length)} more
              </button>
            )}
          </div>
        </div>
      </details>

      <details className={detailsClass}>
        <summary className={summaryClass}>Source records set aside ({count(rejected.length)})</summary>
        <div className={bodyClass}>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">
            These records from CBN did not become auctions on this page. They are kept in the data file exactly as received.
          </p>
          {rejected.length === 0 ? (
            <p className="text-[15px] text-muted">No source record was set aside.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rejected.map((r) => (
                <li key={`${r.index}-${r.id}`} className="flex flex-col gap-1 text-sm">
                  <span>
                    <span className="font-medium">{REJECTION_TITLES[r.kind]}</span>
                    <span className="text-muted"> · record {r.id ?? "without an id"}, position {r.index + 1} in the feed</span>
                  </span>
                  <span className="text-[13px] text-muted">{r.message}</span>
                  <details>
                    <summary className="cursor-pointer text-[13px] text-muted underline underline-offset-2">Record as received</summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-line p-3 font-mono text-xs leading-relaxed">
                      {JSON.stringify(r.raw ?? null, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
