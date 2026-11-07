"use client";

import { bisector, tickStep } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ChartPoint } from "@/lib/data/exchange-rates/quality";
import { formatDate, formatRate } from "@/lib/format";

export type SeriesChoice = "both" | "buy" | "sell";

interface Props {
  /** Points that passed every check, oldest first. These form the lines. */
  buy: ChartPoint[];
  sell: ChartPoint[];
  /** Suspicious points, drawn as separate markers (empty unless the user asked to see them). */
  flaggedBuy: ChartPoint[];
  flaggedSell: ChartPoint[];
  series: SeriesChoice;
  /** Name used in the accessible description, e.g. "US Dollar". */
  label: string;
}

interface Pt {
  t: number;
  v: number;
  p: ChartPoint;
}

const MARGIN = { top: 12, right: 16, bottom: 28, left: 58 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toPts = (points: ChartPoint[]): Pt[] =>
  points.map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`), v: p.value, p }));

function tickLabel(d: Date, spanDays: number): string {
  const m = MONTHS[d.getUTCMonth()];
  if (spanDays <= 100) return `${d.getUTCDate()} ${m}`;
  if (spanDays <= 800) return `${m} ${d.getUTCFullYear()}`;
  return String(d.getUTCFullYear());
}

export function RateChart({ buy, sell, flaggedBuy, flaggedSell, series, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showBuy = series !== "sell";
  const showSell = series !== "buy";

  const model = useMemo(() => {
    const buyPts = showBuy ? toPts(buy) : [];
    const sellPts = showSell ? toPts(sell) : [];
    const all = [...buyPts, ...sellPts];
    if (all.length === 0 || width === 0) return null;

    const height = width < 520 ? 240 : 320;
    const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
    const innerH = height - MARGIN.top - MARGIN.bottom;

    let t0 = Math.min(...all.map((d) => d.t));
    let t1 = Math.max(...all.map((d) => d.t));
    if (t0 === t1) {
      t0 -= 86_400_000;
      t1 += 86_400_000;
    }
    let v0 = Math.min(...all.map((d) => d.v));
    let v1 = Math.max(...all.map((d) => d.v));
    const pad = (v1 - v0) * 0.08 || v1 * 0.01;
    v0 -= pad;
    v1 += pad;

    const x = scaleUtc().domain([new Date(t0), new Date(t1)]).range([0, innerW]);
    const y = scaleLinear().domain([v0, v1]).nice().range([innerH, 0]);
    const [yMin, yMax] = y.domain();

    const path = (pts: Pt[]) =>
      line<Pt>()
        .x((d) => x(new Date(d.t)))
        .y((d) => y(d.v))(pts) ?? "";

    const markers = (points: ChartPoint[]) =>
      toPts(points).filter((d) => d.t >= t0 && d.t <= t1 && d.v >= yMin && d.v <= yMax);
    const mBuy = showBuy ? markers(flaggedBuy) : [];
    const mSell = showSell ? markers(flaggedSell) : [];
    const outside =
      (showBuy ? flaggedBuy.length - mBuy.length : 0) + (showSell ? flaggedSell.length - mSell.length : 0);

    const spanDays = (t1 - t0) / 86_400_000;
    const xTicks = x.ticks(width < 520 ? 4 : 6);
    const yTicks = y.ticks(5);
    // Plain numbers with thousands separators ("1,450"), with only as many decimals as the tick step needs.
    const [d0, d1] = y.domain();
    const step = tickStep(d0, d1, 5);
    const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    const yFormat = (v: number) =>
      v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return {
      height, innerW, innerH, x, y, buyPts, sellPts, mBuy, mSell, outside, spanDays, xTicks, yTicks,
      buyPath: path(buyPts), sellPath: path(sellPts), yFormat,
    };
  }, [buy, sell, flaggedBuy, flaggedSell, showBuy, showSell, width]);

  const hover = useMemo(() => {
    if (!model || hoverX === null) return null;
    const primary = model.buyPts.length > 0 ? model.buyPts : model.sellPts;
    const t = model.x.invert(hoverX).getTime();
    const i = bisector((d: Pt) => d.t).center(primary, t);
    const near = primary[i];
    if (!near) return null;
    const sellAtDate = model.sellPts.find((d) => d.t === near.t);
    const buyAtDate = model.buyPts.find((d) => d.t === near.t);
    const flagged = [...model.mBuy, ...model.mSell]
      .filter((d) => Math.abs(model.x(new Date(d.t)) - hoverX) <= 8)
      .sort((a, b) => Math.abs(model.x(new Date(a.t)) - hoverX) - Math.abs(model.x(new Date(b.t)) - hoverX))[0];
    const px = model.x(new Date(near.t));
    return { near, px, buy: buyAtDate, sell: sellAtDate, flagged };
  }, [model, hoverX]);

  return (
    <div ref={wrapRef} className="relative w-full">
      {!model && width > 0 && (
        <p className="py-16 text-center text-[15px] text-muted">No checked values in this range.</p>
      )}
      {model && (
        <>
          <svg
            width={width}
            height={model.height}
            role="img"
            aria-label={`${label} rate history chart. Exact values are in the Recent values table.`}
            className="block select-none"
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {model.yTicks.map((tick) => (
                <g key={tick} transform={`translate(0,${model.y(tick)})`}>
                  <line x2={model.innerW} className="stroke-line" />
                  <text x={-10} dy="0.32em" textAnchor="end" className="fill-muted text-xs tabular-nums">
                    {model.yFormat(tick)}
                  </text>
                </g>
              ))}
              {model.xTicks.map((tick) => (
                <text
                  key={tick.getTime()}
                  x={model.x(tick)}
                  y={model.innerH + 20}
                  textAnchor="middle"
                  className="fill-muted text-xs"
                >
                  {tickLabel(tick, model.spanDays)}
                </text>
              ))}

              {showSell && (
                <path d={model.sellPath} fill="none" strokeWidth={2} strokeDasharray="7 5" strokeLinejoin="round" className="stroke-olive" />
              )}
              {showBuy && (
                <path d={model.buyPath} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-brand" />
              )}

              {[...model.mBuy, ...model.mSell].map((d, i) => (
                <circle
                  key={`${d.p.date}-${i}`}
                  cx={model.x(new Date(d.t))}
                  cy={model.y(d.v)}
                  r={5}
                  strokeWidth={2}
                  className="fill-paper stroke-down"
                />
              ))}

              {hover && (
                <g>
                  <line x1={hover.px} x2={hover.px} y1={0} y2={model.innerH} className="stroke-ink/30" />
                  {hover.buy && <circle cx={hover.px} cy={model.y(hover.buy.v)} r={4} className="fill-brand" />}
                  {hover.sell && <circle cx={hover.px} cy={model.y(hover.sell.v)} r={4} className="fill-olive" />}
                </g>
              )}

              <rect
                width={model.innerW}
                height={model.innerH}
                fill="transparent"
                style={{ touchAction: "pan-y" }}
                onPointerMove={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  setHoverX(Math.min(Math.max(e.clientX - box.left, 0), model.innerW));
                }}
                onPointerLeave={() => setHoverX(null)}
              />
            </g>
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute top-3 z-10 w-56 rounded-lg border border-line bg-surface p-3 text-sm shadow-sm"
              style={{
                left:
                  MARGIN.left + hover.px > width / 2
                    ? MARGIN.left + hover.px - 232
                    : MARGIN.left + hover.px + 16,
              }}
            >
              <div className="font-medium">{formatDate(hover.near.p.date)}</div>
              {hover.buy && (
                <div className="flex justify-between gap-3 text-muted">
                  Buying <strong className="font-semibold tabular-nums text-ink">{formatRate(hover.buy.v)}</strong>
                </div>
              )}
              {hover.sell && (
                <div className="flex justify-between gap-3 text-muted">
                  Selling <strong className="font-semibold tabular-nums text-ink">{formatRate(hover.sell.v)}</strong>
                </div>
              )}
              {hover.flagged && (
                <div className="mt-2 border-t border-line pt-2 text-xs leading-snug text-down">
                  <span className="font-semibold">Flagged, {formatDate(hover.flagged.p.date)}: </span>
                  {formatRate(hover.flagged.v)}. {hover.flagged.p.reasons[0]?.message}
                </div>
              )}
            </div>
          )}

          {model.outside > 0 && (
            <p className="mt-2 text-xs text-muted">
              {model.outside} flagged value{model.outside === 1 ? " is" : "s are"} too far from the line to plot here.
              They are listed under Flagged records.
            </p>
          )}
        </>
      )}
    </div>
  );
}