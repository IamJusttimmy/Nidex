import { worstStatus } from "./classify";
import {
  NTB_FIELDS,
  type NtbField,
  type NtbObservation,
  type NtbQualityReport,
  type QualityStatus,
  type ReasonCode,
} from "./types";

export interface FieldCounts {
  valid: number;
  suspicious: number;
  invalid: number;
  notPublished: number;
  unparseable: number;
}

export interface ReasonImpact {
  field: NtbField;
  code: ReasonCode;
  /** Status the rule gives the field ("valid" means the reason is a note). */
  status: QualityStatus;
  records: number;
  firstDate: string | null;
  lastDate: string | null;
  sampleIds: number[];
}

export interface NtbSummary {
  sourceRecords: number;
  observations: number;
  rejected: number;
  recordsByWorstStatus: Record<QualityStatus, number>;
  byField: Record<NtbField, FieldCounts>;
  reasons: ReasonImpact[];
  warnings: Record<string, number>;
}

/** Count, for every rule, how many records it touched. The report is generated from this, never typed by hand. */
export function summarizeNtb(report: NtbQualityReport): NtbSummary {
  const recordsByWorstStatus: Record<QualityStatus, number> = { valid: 0, suspicious: 0, invalid: 0 };
  const byField = Object.fromEntries(
    NTB_FIELDS.map((f) => [f, { valid: 0, suspicious: 0, invalid: 0, notPublished: 0, unparseable: 0 }]),
  ) as Record<NtbField, FieldCounts>;
  const impacts = new Map<string, ReasonImpact>();
  const warnings: Record<string, number> = {};

  for (const o of report.observations as NtbObservation[]) {
    recordsByWorstStatus[worstStatus(o)]++;
    for (const w of o.warnings) warnings[w.code] = (warnings[w.code] ?? 0) + 1;
    for (const f of NTB_FIELDS) {
      const a = o.quality[f];
      byField[f][a.status]++;
      if (a.presence === "not-published") byField[f].notPublished++;
      if (a.presence === "unparseable") byField[f].unparseable++;
      const seen = new Set<string>();
      for (const r of a.reasons) {
        const key = `${f}|${r.code}`;
        if (seen.has(key)) continue; // count a record once per field and rule
        seen.add(key);
        const cur =
          impacts.get(key) ??
          ({ field: f, code: r.code, status: a.status, records: 0, firstDate: null, lastDate: null, sampleIds: [] } as ReasonImpact);
        cur.records++;
        if (a.status === "invalid" || (a.status === "suspicious" && cur.status === "valid")) cur.status = a.status;
        if (o.auctionDate) {
          if (cur.firstDate === null || o.auctionDate < cur.firstDate) cur.firstDate = o.auctionDate;
          if (cur.lastDate === null || o.auctionDate > cur.lastDate) cur.lastDate = o.auctionDate;
        }
        if (cur.sampleIds.length < 5) cur.sampleIds.push(o.id);
        impacts.set(key, cur);
      }
    }
  }

  return {
    sourceRecords: report.sourceCount,
    observations: report.observations.length,
    rejected: report.rejected.length,
    recordsByWorstStatus,
    byField,
    reasons: [...impacts.values()].sort((a, b) => b.records - a.records),
    warnings,
  };
}