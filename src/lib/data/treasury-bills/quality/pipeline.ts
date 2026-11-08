import { classifyRecord } from "./classify";
import { DEFAULT_RULES, type NtbRules } from "./config";
import { flagRateSpikes } from "./spike";
import {
  RAW_TEXT_FIELDS,
  type NtbObservation,
  type NtbQualityReport,
  type RawNtbRecord,
  type RejectedRecord,
  type RejectionKind,
} from "./types";

function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

function contentKey(raw: RawNtbRecord): string {
  return JSON.stringify(RAW_TEXT_FIELDS.map((f) => raw[f]));
}

/**
 * The whole pipeline: structural checks -> field-level classification -> rate spike check.
 * The input is read, never changed. Records that cannot become an observation are returned in
 * `rejected` with the reason; nothing is silently dropped.
 */
export function buildNtbQualityReport(input: unknown, rules: NtbRules = DEFAULT_RULES): NtbQualityReport {
  if (!Array.isArray(input)) throw new Error("Expected the CBN response to be an array of records.");

  const rejected: RejectedRecord[] = [];
  const reject = (index: number, id: number | null, kind: RejectionKind, message: string, raw: unknown) =>
    rejected.push({ index, id, kind, message, raw });

  const seenIds = new Set<number>();
  const seenContent = new Map<string, number>();
  const observations: NtbObservation[] = [];

  input.forEach((item: unknown, index: number) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      reject(index, null, "not_an_object", "The entry is not a record.", item);
      return;
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "number" || !Number.isInteger(id)) {
      reject(index, null, "invalid_id", "The record has no whole-number id.", item);
      return;
    }
    if (seenIds.has(id)) {
      reject(index, id, "duplicate_id", `Another record already used id ${id}.`, item);
      return;
    }
    seenIds.add(id);

    const raw = { id } as { id: number } & Record<string, string>;
    for (const f of RAW_TEXT_FIELDS) raw[f] = toText(record[f]);
    const rawRecord = raw as unknown as RawNtbRecord;

    if (rawRecord.securityType.trim().toUpperCase() !== "NTB") {
      reject(index, id, "security_type_not_ntb", `Security type "${rawRecord.securityType}" is not NTB.`, item);
      return;
    }

    const key = contentKey(rawRecord);
    const keptId = seenContent.get(key);
    if (keptId !== undefined) {
      reject(index, id, "duplicate_content", `Identical to record ${keptId} in every field except id. The first is kept.`, item);
      return;
    }
    seenContent.set(key, id);

    observations.push(classifyRecord(rawRecord, rules));
  });

  flagRateSpikes(observations, rules);

  // Same auction date and standard tenor but different content: keep both, warn on both.
  const byAuction = new Map<string, NtbObservation[]>();
  for (const o of observations) {
    if (o.auctionDate === null || o.tenor.group === null) continue;
    const k = `${o.auctionDate}|${o.tenor.group}`;
    byAuction.set(k, [...(byAuction.get(k) ?? []), o]);
  }
  for (const list of byAuction.values()) {
    if (list.length < 2) continue;
    const ids = list.map((o) => o.id).join(", ");
    for (const o of list) {
      o.warnings.push({
        code: "conflicting_duplicate_auction",
        message: `Records ${ids} are all for the same auction date and tenor but are not identical.`,
        detail: { ids },
      });
    }
  }

  observations.sort((a, b) => {
    const da = a.auctionDate ?? "9999-99-99";
    const db = b.auctionDate ?? "9999-99-99";
    return da < db ? -1 : da > db ? 1 : a.id - b.id;
  });

  return { rulesVersion: rules.version, sourceCount: input.length, observations, rejected };
}