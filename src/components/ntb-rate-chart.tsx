"use client";

import { bisector, tickStep } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TenorGroupDays } from "@/lib/data/treasury-bills/quality";
import type { RateSeriesPoint } from "@/lib/data/treasury-bills/series";
import { formatDate, formatRate } from "@/lib/format";

/**
 * One look per tenor. Colour is never the only difference (line style differs too), and the legend in the
 * page uses the same table so the two cannot drift apart.
 */
export const TENOR_STYLE: Record<
  TenorGroupDays,
  { name: string; stroke: string; fill: string; dash: string | undefined; legendDash: string | undefined }
> = {
  91: { name: "91-day", stroke: "stroke-brand", fill: "fill-brand", dash: undefined, legendDash: undefined },
  182: { name: "182-day", stroke: "stroke-olive", fill: "fill-olive", dash: "8 5", legendDash: "6 4" },
  364: { name: "364-day", stroke: "stroke-ink", fill: "fill-ink", dash: "1 5", legendDash: "1 5" },
};

export interface TenorPoints {
  tenor: TenorGroupDays;
  points: RateSeriesPoint[];
}

interface Props {
  /** Rates that passed every check, oldest first. These form the lines. One entry per tenor being shown. */
  lines: TenorPoints[];
  /** Suspicious rates, drawn as separate markers (empty unless the viewer asked to see them). */
  flagged: TenorPoints[];
  /** The rate label being shown, named in the accessible description. */
  labelName: string;
}

interface Pt {
  t: number;
  v: number;
  p: RateSeriesPoint;
}

const MARGIN = { top: 12, right: 16, bottom: 28, left: 58 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toPts = (points: RateSeriesPoint[]): Pt[] =>
  points.map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`), v: p.rate, p }));

function tickLabel(d: Date, spanDays: number): string {
  const m = MONTHS[d.getUTCMonth()];
  if (spanDays <= 100) return `${d.getUTCDate()} ${m}`;
  if (spanDays <= 800) return `${m} ${d.getUTCFullYear()}`;
  return String(d.getUTCFullYear());
}

export function NtbRateChart({ lines, flagged, labelName }: Props) {
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

  const model = useMemo(() => {
    const lineSets = lines.map((l) => ({ tenor: l.tenor, pts: toPts(l.points) })).filter((l) => l.pts.length > 0);
    const all = lineSets.flatMap((l) => l.pts);
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

    const shownTenors = new Set(lineSets.map((l) => l.tenor));
    const allMarkers = flagged.filter((f) => shownTenors.has(f.tenor)).flatMap((f) => toPts(f.points).map((d) => ({ ...d, tenor: f.tenor })));
    const markers = allMarkers.filter((d) => d.t >= t0 && d.t <= t1 && d.v >= yMin && d.v <= yMax);

    const spanDays = (t1 - t0) / 86_400_000;
    const xTicks = x.ticks(width < 520 ? 4 : 6);
    const yTicks = y.ticks(5);
    const step = tickStep(yMin, yMax, 5);
    const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    const yFormat = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    return {
      height, innerW, innerH, x, y, spanDays, xTicks, yTicks, yFormat, markers,
      outside: allMarkers.length - markers.length,
      lineSets: lineSets.map((l) => ({ ...l, d: path(l.pts) })),
    };
  }, [lines, flagged, width]);

  const hover = useMemo(() => {
    if (!model || hoverX === null) return null;
    const t = model.x.invert(hoverX).getTime();
    let near: Pt | null = null;
    let best = Infinity;
    for (const l of model.lineSets) {
      const c = l.pts[bisector((d: Pt) => d.t).center(l.pts, t)];
      if (c && Math.abs(c.t - t) < best) {
        best = Math.abs(c.t - t);
        near = c;
      }
    }
    if (!near) return null;
    const nearT = near.t;
    const rows = model.lineSets.flatMap((l) => {
      const pt = l.pts.find((d) => d.t === nearT);
      return pt ? [{ tenor: l.tenor, pt }] : [];
    });
    const flaggedNear = model.markers
      .filter((d) => Math.abs(model.x(new Date(d.t)) - hoverX) <= 8)
      .sort((a, b) => Math.abs(model.x(new Date(a.t)) - hoverX) - Math.abs(model.x(new Date(b.t)) - hoverX))[0];
    return { date: near.p.date, px: model.x(new Date(nearT)), rows, flagged: flaggedNear };
  }, [model, hoverX]);

  return (
    <div ref={wrapRef} className="relative w-full">
      {!model && width > 0 && (
        <p className="py-16 text-center text-[15px] text-muted">No checked rates in this range.</p>
      )}
      {model && (
        <>
          <svg
            width={width}
            height={model.height}
            role="img"
            aria-label={`Treasury bill rate history chart for the ${labelName} label. Hover over the chart for exact values.`}
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
                <text key={tick.getTime()} x={model.x(tick)} y={model.innerH + 20} textAnchor="middle" className="fill-muted text-xs">
                  {tickLabel(tick, model.spanDays)}
                </text>
              ))}

              {model.lineSets.map((l) => (
                <path
                  key={l.tenor}
                  d={l.d}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={TENOR_STYLE[l.tenor].dash}
                  className={TENOR_STYLE[l.tenor].stroke}
                />
              ))}

              {model.markers.map((d) => (
                <circle
                  key={`${d.p.id}`}
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
                  {hover.rows.map((r) => (
                    <circle key={r.tenor} cx={hover.px} cy={model.y(r.pt.v)} r={4} className={TENOR_STYLE[r.tenor].fill} />
                  ))}
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
              className="pointer-events-none absolute top-3 z-10 w-64 rounded-lg border border-line bg-surface p-3 text-sm shadow-sm"
              style={{
                left: MARGIN.left + hover.px > width / 2 ? MARGIN.left + hover.px - 272 : MARGIN.left + hover.px + 16,
              }}
            >
              <div className="font-medium">{formatDate(hover.date)}</div>
              {hover.rows.map((r) => (
                <div key={r.tenor} className="mt-1">
                  <div className="flex justify-between gap-3 text-muted">
                    {TENOR_STYLE[r.tenor].name}
                    <strong className="font-semibold tabular-nums text-ink">{formatRate(r.pt.v)}%</strong>
                  </div>
                  <div className="text-xs text-muted">
                    As published: {r.pt.p.rawTenor}, “{r.pt.p.rawLabel}”
                  </div>
                </div>
              ))}
              {hover.flagged && (
                <div className="mt-2 border-t border-line pt-2 text-xs leading-snug text-down">
                  <span className="font-semibold">
                    Suspicious, {TENOR_STYLE[hover.flagged.tenor].name}, {formatDate(hover.flagged.p.date)}:{" "}
                  </span>
                  {formatRate(hover.flagged.v)}%. {hover.flagged.p.rateReasons[0]?.message}
                </div>
              )}
            </div>
          )}

          {model.outside > 0 && (
            <p className="mt-2 text-xs text-muted">
              {model.outside} suspicious rate{model.outside === 1 ? " is" : "s are"} too far from the lines to plot
              here.
            </p>
          )}
        </>
      )}
    </div>
  );
}