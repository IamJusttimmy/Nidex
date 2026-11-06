import type { QualityRules } from "./config";
import type { RateObservation } from "./types";

type Item = Omit<RateObservation, "verification" | "verificationNote">;

const centre = (o: Item) => (o.buy !== null && o.sell !== null ? (o.buy + o.sell) / 2 : null);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * EVIDENCE ONLY. Compares each currency's implied cross rate against USD
 * (USD centre / currency centre, both taken from buy and sell, never from mid)
 * with the median of its nearest clean neighbours. A currency that suddenly implies a
 * different USD exchange rate than it did a day earlier and later is worth a warning.
 *
 * Adds a `warnings` entry. It never changes `quality`, any value, or verification.
 * Not evaluated when USD is missing or unusable on that date, or fewer than 2 clean
 * reference observations exist. A move shared by the whole table (including USD)
 * leaves every cross rate unchanged, so it produces no warning by design.
 */
export function attachCrossRateWarnings<T extends Item>(items: T[], rules: QualityRules): T[] {
  const usdByDate = new Map<string, number>();
  for (const o of items) {
    if (o.code !== "USD") continue;
    const c = centre(o);
    if (c !== null && o.quality.buy.status !== "invalid" && o.quality.sell.status !== "invalid" && o.quality.quotePair.status === "valid") {
      usdByDate.set(o.date, c);
    }
  }

  const byCode = new Map<string, T[]>();
  for (const o of items) {
    const list = byCode.get(o.code);
    if (list) list.push(o);
    else byCode.set(o.code, [o]);
  }

  const result = new Map<T, T>();
  for (const [code, series] of byCode) {
    if (code === "USD" || rules.crossRateExcludedCodes.includes(code)) continue;
    const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
    const implied = sorted.map((o) => {
      const usd = usdByDate.get(o.date);
      const c = centre(o);
      return usd !== undefined && c !== null && c > 0 ? usd / c : null;
    });
    const clean = (o: T) =>
      o.quality.buy.status === "valid" && o.quality.sell.status === "valid" && o.quality.quotePair.status === "valid";

    sorted.forEach((o, i) => {
      const own = implied[i];
      if (own === null) return;
      const refs: number[] = [];
      let got = 0;
      for (let j = i - 1; j >= 0 && got < 2; j--) {
        const v = implied[j];
        if (v !== null && clean(sorted[j])) {
          refs.push(v);
          got++;
        }
      }
      got = 0;
      for (let j = i + 1; j < sorted.length && got < 2; j++) {
        const v = implied[j];
        if (v !== null && clean(sorted[j])) {
          refs.push(v);
          got++;
        }
      }
      if (refs.length < 2) return;
      const ref = median(refs);
      const deviation = Math.abs(own / ref - 1);
      if (deviation > rules.crossRateThreshold) {
        result.set(o, {
          ...o,
          warnings: [
            ...o.warnings,
            {
              code: "cross_rate_break",
              message: `Measured against the US dollar, ${code} implies an exchange rate ${(deviation * 100).toFixed(0)}% different from the surrounding days. Another currency would normally move with it.`,
              detail: { implied: Number(own.toFixed(6)), reference: Number(ref.toFixed(6)), deviation: Number(deviation.toFixed(4)) },
            },
          ],
        });
      }
    });
  }
  return items.map((o) => result.get(o) ?? o);
}
