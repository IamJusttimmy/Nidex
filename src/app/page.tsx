"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

// ── Types ─────────────────────────────────────────────────────────────────────

type Dataset = "exchange-rates" | "money-market" | "treasury-bills" | "mutual-funds";

interface SearchResult {
  dataset: Dataset;
  datasetLabel: string;
  label: string;
  sublabel: string;
  href: string;
}

// ── Static index entries ──────────────────────────────────────────────────────

const MONEY_MARKET_ENTRIES: SearchResult[] = [
  { dataset: "money-market", datasetLabel: "Money Market", label: "Monetary Policy Rate (MPR)", sublabel: "CBN benchmark policy rate", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "Minimum Rediscount Rate (MRR)", sublabel: "Legacy policy rate, pre-2007", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "Interbank Call Rate", sublabel: "Overnight rate between banks", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "Treasury Bill Rate (money market)", sublabel: "Money market T-bill rate", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "Savings Deposit Rate", sublabel: "Rate on savings deposits", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "1-Month Deposit Rate", sublabel: "Rate on 1-month fixed deposits", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "3-Month Deposit Rate", sublabel: "Rate on 3-month fixed deposits", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "6-Month Deposit Rate", sublabel: "Rate on 6-month fixed deposits", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "12-Month Deposit Rate", sublabel: "Rate on 12-month fixed deposits", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "Prime Lending Rate", sublabel: "Best rate offered to prime borrowers", href: "/money-market" },
  { dataset: "money-market", datasetLabel: "Money Market", label: "Maximum Lending Rate", sublabel: "Ceiling rate on loans", href: "/money-market" },
];

const TREASURY_BILL_ENTRIES: SearchResult[] = [
  { dataset: "treasury-bills", datasetLabel: "Treasury Bills", label: "91-Day Treasury Bill", sublabel: "Short-term CBN auction instrument", href: "/treasury-bills" },
  { dataset: "treasury-bills", datasetLabel: "Treasury Bills", label: "182-Day Treasury Bill", sublabel: "Medium-term CBN auction instrument", href: "/treasury-bills" },
  { dataset: "treasury-bills", datasetLabel: "Treasury Bills", label: "364-Day Treasury Bill", sublabel: "Long-term CBN auction instrument", href: "/treasury-bills" },
];

const STATIC_INDEX: SearchResult[] = [...MONEY_MARKET_ENTRIES, ...TREASURY_BILL_ENTRIES];

// ── Dynamic index loaders ─────────────────────────────────────────────────────

interface ExchangeRateLatest {
  as_of: string;
  rates: { code: string; name: string }[];
}

interface MutualFundsLatest {
  observations: { fundName: string; category: string | null }[];
}

function buildExchangeRateEntries(json: ExchangeRateLatest): SearchResult[] {
  const seen = new Set<string>();
  return (json.rates ?? []).flatMap((r) => {
    if (seen.has(r.code)) return [];
    seen.add(r.code);
    return [{
      dataset: "exchange-rates" as const,
      datasetLabel: "Exchange Rates",
      label: `${r.code} — ${r.name}`,
      sublabel: "NAFEM window rate",
      href: `/exchange-rates/${r.code}`,
    }];
  });
}

function buildMutualFundEntries(json: MutualFundsLatest): SearchResult[] {
  const seen = new Set<string>();
  return (json.observations ?? []).flatMap((o) => {
    if (seen.has(o.fundName)) return [];
    seen.add(o.fundName);
    return [{
      dataset: "mutual-funds" as const,
      datasetLabel: "Mutual Funds",
      label: o.fundName,
      sublabel: o.category ?? "Collective investment scheme",
      href: "/mutual-funds",
    }];
  });
}

// ── Search logic ──────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function score(result: SearchResult, query: string): number {
  const q = normalize(query);
  const label = normalize(result.label);
  const sublabel = normalize(result.sublabel);
  const dataset = normalize(result.datasetLabel);

  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (sublabel.includes(q)) return 40;
  if (dataset.includes(q)) return 20;

  const words = q.split(" ").filter(Boolean);
  const haystack = `${label} ${sublabel} ${dataset}`;
  if (words.every((w) => haystack.includes(w))) return 10;

  return 0;
}

function search(index: SearchResult[], query: string): SearchResult[] {
  if (!query.trim()) return [];
  return index
    .map((r) => ({ r, s: score(r, query) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .map(({ r }) => r)
    .slice(0, 12);
}

// ── Dataset badge colours ─────────────────────────────────────────────────────

const BADGE_STYLES: Record<Dataset, string> = {
  "exchange-rates": "bg-sky-100 text-sky-800",
  "money-market":   "bg-emerald-100 text-emerald-800",
  "treasury-bills": "bg-amber-100 text-amber-800",
  "mutual-funds":   "bg-violet-100 text-violet-800",
};

// ── Components ────────────────────────────────────────────────────────────────

function ResultItem({ result }: { result: SearchResult }) {
  return (
    <Link
      href={result.href}
      className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3 hover:border-brand hover:bg-brand-soft transition-colors group"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium group-hover:text-brand transition-colors">
          {result.label}
        </div>
        <div className="text-xs text-muted mt-0.5">
          {result.sublabel}
        </div>
      </div>
      <span className={`shrink-0 mt-0.5 rounded px-2 py-0.5 text-[11px] font-medium ${BADGE_STYLES[result.dataset]}`}>
        {result.datasetLabel}
      </span>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [index, setIndex] = useState<SearchResult[]>(STATIC_INDEX);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [exRes, mfRes] = await Promise.allSettled([
        fetch("/data/exchange-rates/latest.json").then((r) => r.json()),
        fetch("/data/mutual-funds/latest.json").then((r) => r.json()),
      ]);

      if (cancelled) return;

      const extra: SearchResult[] = [];
      if (exRes.status === "fulfilled") {
        extra.push(...buildExchangeRateEntries(exRes.value as ExchangeRateLatest));
      }
      if (mfRes.status === "fulfilled") {
        extra.push(...buildMutualFundEntries(mfRes.value as MutualFundsLatest));
      }

      if (extra.length > 0) {
        setIndex((prev) => [...prev, ...extra]);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => search(index, submitted), [index, submitted]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(query.trim());
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          Nigeria&apos;s financial data, unfiltered.
        </h1>
        <p className="text-[var(--color-muted)] leading-relaxed text-sm">
          Search across exchange rates, money market indicators, treasury bill
          auctions, and mutual funds. All sourced directly from CBN and SEC
          publications.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="mb-6">
        <InputGroup className="h-11 rounded-xl border-[var(--color-line)] bg-[var(--color-surface)] focus-within:border-[var(--color-brand)]">
          <InputGroupAddon align="inline-start">
            <Search size={15} className="text-muted" />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setSubmitted(v.trim());
            }}
            placeholder="Search datasets, rates, funds…"
            className="text-[var(--color-ink)] placeholder:text-[var(--color-muted)]"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={() => {
                  setQuery("");
                  setSubmitted("");
                  inputRef.current?.focus();
                }}
              >
                <X size={13} className="text-muted" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </form>

      {/* Results */}
      {submitted && results.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] mb-6">
          No results for <strong>&ldquo;{submitted}&rdquo;</strong>. Try a currency code, rate name, or fund name.
        </p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          {results.map((r, i) => (
            <ResultItem key={`${r.dataset}-${r.label}-${i}`} result={r} />
          ))}
        </div>
      )}

      {/* Suggestions */}
      {!submitted && (
        <p className="text-xs text-[var(--color-muted)]">
          Try searching for{" "}
          {["USD", "MPR", "91-day", "ARM Discovery Fund"].map((term, i, arr) => (
            <span key={term}>
              <button
                type="button"
                onClick={() => { setQuery(term); setSubmitted(term); }}
                className="underline underline-offset-2 hover:text-brand transition-colors"
              >
                {term}
              </button>
              {i < arr.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      )}
    </main>
  );
}