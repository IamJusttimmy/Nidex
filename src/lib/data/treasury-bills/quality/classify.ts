import { DEFAULT_RULES, type NtbRules, type TenorGroup } from "./config";
import {
  daysBetween,
  expectedTrueYield,
  parseBidRange,
  parseCbnDate,
  parseNumber,
  parseTenorDays,
  standardiseRateLabel,
} from "./parse";
import {
  NTB_FIELDS,
  type BidRange,
  type FieldAssessment,
  type NtbField,
  type NtbObservation,
  type QualityStatus,
  type RawNtbRecord,
  type Reason,
  type Warning,
} from "./types";

const ORDER: Record<QualityStatus, number> = { valid: 0, suspicious: 1, invalid: 2 };

const FIELD_NAMES: Record<NtbField, string> = {
  auctionDate: "auction date",
  tenor: "tenor",
  maturityDate: "maturity date",
  rate: "rate",
  rateLabel: "rate label",
  trueYield: "true yield",
  rangeBid: "range of bid rates",
  successfulBidRates: "range of successful bid rates",
  amtOffered: "amount offered",
  totalSubscription: "total subscription",
  totalSuccessful: "total allotment",
};

export function fresh(): FieldAssessment {
  return { status: "valid", presence: "published", reasons: [] };
}

/** Raise a status (never lower it) and record why. */
export function escalate(a: FieldAssessment, status: Exclude<QualityStatus, "valid">, reason: Reason): void {
  if (ORDER[status] > ORDER[a.status]) a.status = status;
  a.reasons.push(reason);
}

/** Read a number field. Empty and (where configured) zero mean "not published". */
function readNumber(field: NtbField, text: string, rules: NtbRules, a: FieldAssessment): number | null {
  const p = parseNumber(text);
  const name = FIELD_NAMES[field];
  switch (p.kind) {
    case "empty":
      a.presence = "not-published";
      a.reasons.push({ code: "not_published_empty", message: `CBN left the ${name} empty.` });
      return null;
    case "zero":
      if (rules.zeroMeansMissing.includes(field)) {
        a.presence = "not-published";
        a.reasons.push({
          code: "not_published_zero",
          message: `CBN wrote ${text.trim()} for the ${name}. Nidex treats this as "not published", not as a value of zero.`,
          detail: { raw: text.trim() },
        });
        return null;
      }
      return 0;
    case "unparseable":
      a.presence = "unparseable";
      escalate(a, "invalid", { code: "unparseable", message: `"${text}" is not a readable number for the ${name}.` });
      return null;
    case "number":
      if (p.value < 0) {
        escalate(a, "invalid", {
          code: "negative_value",
          message: `The ${name} is negative (${p.value}), which is not possible.`,
          detail: { value: p.value },
        });
      }
      return p.value;
  }
}

function readDate(field: "auctionDate" | "maturityDate", text: string, a: FieldAssessment): string | null {
  const iso = parseCbnDate(text);
  if (iso !== null) return iso;
  if (text.trim() === "") {
    a.presence = "not-published";
    escalate(a, "invalid", { code: "not_published_empty", message: `CBN left the ${FIELD_NAMES[field]} empty.` });
  } else {
    a.presence = "unparseable";
    escalate(a, "invalid", { code: "unparseable", message: `"${text}" is not a readable ${FIELD_NAMES[field]}.` });
  }
  return null;
}

function readRange(
  field: "rangeBid" | "successfulBidRates",
  text: string,
  rules: NtbRules,
  a: FieldAssessment,
): BidRange | null {
  const name = FIELD_NAMES[field];
  const p = parseBidRange(text);
  switch (p.kind) {
    case "empty":
      a.presence = "not-published";
      a.reasons.push({ code: "not_published_empty", message: `CBN left the ${name} empty.` });
      return null;
    case "zero":
      a.presence = "not-published";
      a.reasons.push({
        code: "not_published_zero",
        message: `CBN wrote ${text.trim()} for the ${name}. Nidex treats this as "not published".`,
        detail: { raw: text.trim() },
      });
      return null;
    case "unparseable":
      a.presence = "unparseable";
      escalate(a, "invalid", {
        code: "unparseable",
        message: `The ${name} ("${text.replace(/\s+/g, " ").trim()}") cannot be read as one rate or a range of two.`,
      });
      return null;
    case "single":
      a.reasons.push({
        code: "bid_range_single_value",
        message: `CBN published one rate (${p.value}) for the ${name}, not a range.`,
        detail: { value: p.value },
      });
      return checkRangeBounds(name, { low: p.value, high: p.value }, rules, a);
    case "range":
      return checkRangeBounds(name, { low: p.low, high: p.high }, rules, a);
  }
}

function checkRangeBounds(name: string, range: BidRange, rules: NtbRules, a: FieldAssessment): BidRange {
  if (range.high > rules.maxPlausibleRatePercent || range.low > rules.maxPlausibleRatePercent) {
    escalate(a, "invalid", {
      code: "bid_rate_implausible",
      message: `The ${name} has a rate above ${rules.maxPlausibleRatePercent}% (${range.low} to ${range.high}), which looks like a corrupted number.`,
      detail: { low: range.low, high: range.high },
    });
  } else if (range.low > range.high) {
    escalate(a, "invalid", {
      code: "bid_range_reversed",
      message: `The ${name} starts higher (${range.low}) than it ends (${range.high}).`,
      detail: { low: range.low, high: range.high },
    });
  }
  return range;
}

function findGroup(rules: NtbRules, labelDays: number | null): TenorGroup | null {
  if (labelDays === null) return null;
  return rules.tenorGroups.find((g) => g.labelDays.includes(labelDays)) ?? null;
}

/**
 * Classify one CBN record. Every field is judged on its own, so an invalid maturity date does not
 * stop the rate being usable, and vice versa. The raw record is copied, never changed.
 */
export function classifyRecord(source: RawNtbRecord, rules: NtbRules = DEFAULT_RULES): NtbObservation {
  const raw = Object.freeze({ ...source });
  const quality = Object.fromEntries(NTB_FIELDS.map((f) => [f, fresh()])) as Record<NtbField, FieldAssessment>;
  const warnings: Warning[] = [];

  // ---- Read every field first (no cross-checks yet) ----
  const auctionDate = readDate("auctionDate", raw.auctionDate, quality.auctionDate);
  const maturityDate = readDate("maturityDate", raw.maturityDate, quality.maturityDate);
  const rate = readNumber("rate", raw.rate, rules, quality.rate);
  const trueYield = readNumber("trueYield", raw.trueYield, rules, quality.trueYield);
  const amtOffered = readNumber("amtOffered", raw.amtOffered, rules, quality.amtOffered);
  const totalSubscription = readNumber("totalSubscription", raw.totalSubscription, rules, quality.totalSubscription);
  const totalSuccessful = readNumber("totalSuccessful", raw.totalSuccessful, rules, quality.totalSuccessful);
  const rangeBid = readRange("rangeBid", raw.rangeBid, rules, quality.rangeBid);
  const successfulBidRates = readRange("successfulBidRates", raw.successfulBidRates, rules, quality.successfulBidRates);

  // ---- Tenor ----
  const labelDays = parseTenorDays(raw.tenor);
  const group = findGroup(rules, labelDays);
  const tq = quality.tenor;
  if (labelDays === null) {
    tq.presence = raw.tenor.trim() === "" ? "not-published" : "unparseable";
    escalate(tq, "invalid", { code: "unparseable", message: `The tenor "${raw.tenor}" is not a readable number of days.` });
  } else if (!group) {
    escalate(tq, "suspicious", {
      code: "tenor_not_standard",
      message: `The tenor is written as ${labelDays} days, which is not one of the standard 91, 182 or 364-day bills.`,
      detail: { labelDays },
    });
  } else if (labelDays !== group.days) {
    tq.reasons.push({
      code: "tenor_label_variant",
      message: `Labelled ${labelDays} days; grouped with the ${group.days}-day bills.`,
      detail: { labelDays, group: group.days },
    });
  }

  // ---- Rate ----
  if (rate !== null && rate > rules.maxPlausibleRatePercent) {
    escalate(quality.rate, "invalid", {
      code: "rate_implausible",
      message: `The rate (${rate}) is above ${rules.maxPlausibleRatePercent}%, which looks like a corrupted number.`,
      detail: { rate },
    });
  }
  if (rate !== null && quality.rate.status === "valid" && rangeBid && quality.rangeBid.status === "valid") {
    if (rate < rangeBid.low - rules.bidRangeTolerance || rate > rangeBid.high + rules.bidRangeTolerance) {
      escalate(quality.rate, "suspicious", {
        code: "rate_outside_bid_range",
        message: `The rate (${rate}) is outside the published range of bid rates (${rangeBid.low} to ${rangeBid.high}).`,
        detail: { rate, bidLow: rangeBid.low, bidHigh: rangeBid.high },
      });
    }
  }

  // ---- Rate label (original text kept beside the standardised one) ----
  const labelText = raw.rateDescription;
  const labelDisplay = standardiseRateLabel(labelText);
  const lq = quality.rateLabel;
  if (labelText.trim() === "") {
    lq.presence = "not-published";
    lq.reasons.push({ code: "not_published_empty", message: "CBN left the rate label empty." });
  } else if (labelDisplay === null) {
    escalate(lq, "suspicious", {
      code: "rate_label_unrecognised",
      message: `The rate label "${labelText.trim()}" is not one Nidex recognises, so no standard label is shown.`,
      detail: { raw: labelText },
    });
  } else if (labelDisplay.toLowerCase() !== labelText.trim().toLowerCase()) {
    lq.reasons.push({
      code: "rate_label_standardised",
      message: `The label "${labelText.trim()}" is shown as "${labelDisplay}".`,
      detail: { raw: labelText.trim(), display: labelDisplay },
    });
  }

  // ---- True yield vs the published rate (evidence only; nothing is replaced) ----
  let yieldFitsTenor: boolean | null = null;
  if (group && rate !== null && trueYield !== null && quality.rate.status !== "invalid") {
    const expected = expectedTrueYield(rate, group.days);
    const deviation = Math.abs(trueYield - expected);
    yieldFitsTenor = deviation <= rules.trueYieldTolerance;
    if (!yieldFitsTenor && quality.trueYield.status === "valid") {
      escalate(quality.trueYield, "suspicious", {
        code: "true_yield_inconsistent_with_rate",
        message: `The published true yield (${trueYield}) differs from the ${expected.toFixed(4)} that a ${rate} rate implies for a ${group.days}-day bill.`,
        detail: { trueYield, expected: Number(expected.toFixed(4)), deviation: Number(deviation.toFixed(4)), rate, days: group.days },
      });
    }
  }
  if (trueYield !== null && trueYield > rules.maxPlausibleRatePercent && quality.trueYield.status !== "invalid") {
    escalate(quality.trueYield, "invalid", {
      code: "rate_implausible",
      message: `The true yield (${trueYield}) is above ${rules.maxPlausibleRatePercent}%, which looks like a corrupted number.`,
      detail: { trueYield },
    });
  }

  // ---- Maturity ----
  let daysToMaturity: number | null = null;
  if (auctionDate && maturityDate) {
    daysToMaturity = daysBetween(auctionDate, maturityDate);
    const mq = quality.maturityDate;
    if (daysToMaturity <= 0) {
      escalate(mq, "invalid", {
        code: "maturity_not_after_auction",
        message: `The maturity date (${maturityDate}) is not after the auction date (${auctionDate}).`,
        detail: { daysToMaturity },
      });
    } else if (group) {
      const [lo, hi] = group.maturityDays;
      if (daysToMaturity < lo || daysToMaturity > hi) {
        const support =
          yieldFitsTenor === true
            ? ` The published true yield fits a ${group.days}-day bill, which supports the tenor over the maturity date.`
            : "";
        escalate(mq, "suspicious", {
          code: "maturity_inconsistent_with_tenor",
          message: `The maturity date is ${daysToMaturity} days after the auction; a ${group.days}-day bill matures ${lo} to ${hi} days after.${support}`,
          detail: { daysToMaturity, expectedFrom: lo, expectedTo: hi, tenorGroup: group.days, yieldFitsTenor },
        });
      }
    }
  }

  // ---- Successful range vs bid range ----
  if (
    rangeBid &&
    successfulBidRates &&
    quality.rangeBid.status === "valid" &&
    quality.successfulBidRates.status === "valid" &&
    (successfulBidRates.low < rangeBid.low - rules.bidRangeTolerance ||
      successfulBidRates.high > rangeBid.high + rules.bidRangeTolerance)
  ) {
    escalate(quality.successfulBidRates, "suspicious", {
      code: "successful_range_outside_bid_range",
      message: `The successful bids (${successfulBidRates.low} to ${successfulBidRates.high}) go outside the range of all bids (${rangeBid.low} to ${rangeBid.high}).`,
      detail: { successLow: successfulBidRates.low, successHigh: successfulBidRates.high, bidLow: rangeBid.low, bidHigh: rangeBid.high },
    });
  }

  // ---- Allotment vs subscription ----
  if (
    totalSubscription !== null &&
    totalSuccessful !== null &&
    quality.totalSubscription.status !== "invalid" &&
    quality.totalSuccessful.status !== "invalid" &&
    totalSuccessful > totalSubscription + 0.00005
  ) {
    const detail = { totalSuccessful, totalSubscription };
    const message = `The total allotment (${totalSuccessful}) is larger than the total subscription (${totalSubscription}). Allotment cannot exceed the bids received, so at least one of the two values is wrong. Nidex cannot tell which.`;
    escalate(quality.totalSuccessful, "suspicious", { code: "allotment_exceeds_subscription", message, detail });
    escalate(quality.totalSubscription, "suspicious", { code: "allotment_exceeds_subscription", message, detail });
  }

  // ---- Amounts on very different scales (cause unknown: mixed units or a source data error) ----
  if (
    amtOffered !== null &&
    totalSubscription !== null &&
    totalSuccessful !== null &&
    quality.amtOffered.status !== "invalid" &&
    quality.totalSubscription.status !== "invalid" &&
    quality.totalSuccessful.status !== "invalid"
  ) {
    const ratio = Math.max(totalSubscription, totalSuccessful) / amtOffered;
    if (ratio >= rules.amountScaleRatio || ratio <= 1 / rules.amountScaleRatio) {
      const detail = { amtOffered, totalSubscription, totalSuccessful, ratio: Math.round(ratio * 1000) / 1000 };
      const size = ratio >= 1 ? `${Math.round(ratio).toLocaleString("en-US")} times` : `1/${Math.round(1 / ratio).toLocaleString("en-US")} of`;
      const message = `The amounts are on very different scales: the larger of total subscription (${totalSubscription}) and total allotment (${totalSuccessful}) is ${size} the amount offered (${amtOffered}). Nidex cannot tell the cause: the values may have been written in different units, or one may be a data-entry error at the source. At least one of the three is wrong, and Nidex cannot tell which.`;
      for (const f of ["amtOffered", "totalSubscription", "totalSuccessful"] as const) {
        escalate(quality[f], "suspicious", { code: "amount_scale_inconsistent", message, detail });
      }
    }
  }

  // ---- Evidence-only warning: how the rate relates to the top successful bid ----
  if (rate !== null && successfulBidRates && quality.successfulBidRates.status === "valid" && quality.rate.status === "valid") {
    if (Math.abs(rate - successfulBidRates.high) > 0.00005) {
      warnings.push({
        code: "rate_differs_from_top_successful_bid",
        message: `The rate (${rate}) is not the highest successful bid (${successfulBidRates.high}).`,
        detail: { rate, topSuccessfulBid: successfulBidRates.high },
      });
    }
  }

  return {
    id: raw.id,
    raw,
    auctionDate,
    maturityDate,
    daysToMaturity,
    tenor: { rawText: raw.tenor, labelDays, group: group ? group.days : null },
    rate,
    rateLabel: { raw: labelText, display: labelDisplay },
    trueYield,
    rangeBid,
    successfulBidRates,
    amtOffered,
    totalSubscription,
    totalSuccessful,
    amountUnit: rules.amountUnit.status,
    quality,
    warnings,
  };
}

export function worstStatus(o: NtbObservation): QualityStatus {
  let worst: QualityStatus = "valid";
  for (const f of NTB_FIELDS) {
    if (ORDER[o.quality[f].status] > ORDER[worst]) worst = o.quality[f].status;
  }
  return worst;
}