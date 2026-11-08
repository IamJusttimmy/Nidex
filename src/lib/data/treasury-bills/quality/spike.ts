import type { NtbRules } from "./config";
import { escalate } from "./classify";
import type { NtbObservation } from "./types";

/**
 * rate_spike_reversion: a rate that jumps away from the previous auction of the same bill and
 * is undone at the next one. Judged within each standard tenor (91, 182, 364), using only
 * observations whose own `rate` field is valid. No other field takes part: a suspicious maturity date,
 * true yield, amount or bid range never removes an observation from this comparison. The rate is only
 * questioned, never changed.
 */
export function flagRateSpikes(observations: NtbObservation[], rules: NtbRules): void {
  const groups = new Map<number, NtbObservation[]>();
  for (const o of observations) {
    if (o.tenor.group === null || o.auctionDate === null || o.rate === null) continue;
    if (o.quality.rate.status !== "valid") continue;
    const list = groups.get(o.tenor.group) ?? [];
    list.push(o);
    groups.set(o.tenor.group, list);
  }

  const flagged: { o: NtbObservation; previous: number; next: number; jump: number }[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => ((a.auctionDate ?? "") < (b.auctionDate ?? "") ? -1 : (a.auctionDate ?? "") > (b.auctionDate ?? "") ? 1 : a.id - b.id));
    for (let i = 1; i < list.length - 1; i++) {
      const cur = list[i];
      const prev = list[i - 1];
      const next = list[i + 1];
      if (!cur || !prev || !next || cur.rate === null || prev.rate === null || next.rate === null) continue;
      const jump = Math.abs(cur.rate - prev.rate);
      const undone = Math.abs(next.rate - prev.rate) <= rules.spikeRevertFraction * jump;
      if (jump >= rules.spikeMinJumpPoints && jump / prev.rate >= rules.spikeMinJumpRatio && undone) {
        flagged.push({ o: cur, previous: prev.rate, next: next.rate, jump });
      }
    }
  }

  // Apply after all are found, so one flag never changes another's neighbours.
  for (const { o, previous, next, jump } of flagged) {
    escalate(o.quality.rate, "suspicious", {
      code: "rate_spike_reversion",
      message: `The rate (${o.rate}) moved ${jump.toFixed(2)} points from the previous ${o.tenor.group}-day auction (${previous}) and returned at the next (${next}).`,
      detail: { rate: o.rate ?? 0, previous, next, jumpPoints: Number(jump.toFixed(4)) },
    });
  }
}