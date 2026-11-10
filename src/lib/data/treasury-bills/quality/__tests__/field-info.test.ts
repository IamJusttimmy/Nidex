import { describe, expect, it } from "vitest";
import {
  AMOUNT_FIELDS,
  FIELD_LABELS,
  NTB_FIELDS,
  RAW_KEY_OF_FIELD,
  RAW_TEXT_FIELDS,
  REASON_CODES,
  REASON_TITLES,
  REJECTION_KINDS,
  REJECTION_TITLES,
  WARNING_CODES,
  WARNING_TITLES,
} from "../index";

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe("display wording tables", () => {
  it("name every judged field, once each", () => {
    for (const f of NTB_FIELDS) expect(FIELD_LABELS[f]).toBeTruthy();
    expect(Object.keys(FIELD_LABELS).sort()).toEqual([...NTB_FIELDS].sort());
    expect(unique(Object.values(FIELD_LABELS))).toBe(true);
  });

  it("point every judged field at a real CBN text field", () => {
    expect(Object.keys(RAW_KEY_OF_FIELD).sort()).toEqual([...NTB_FIELDS].sort());
    for (const f of NTB_FIELDS) expect(RAW_TEXT_FIELDS).toContain(RAW_KEY_OF_FIELD[f]);
  });

  it("list exactly the three amount fields, and all are judged fields", () => {
    expect([...AMOUNT_FIELDS].sort()).toEqual(["amtOffered", "totalSubscription", "totalSuccessful"]);
    for (const f of AMOUNT_FIELDS) expect(NTB_FIELDS).toContain(f);
  });

  it("give every rule, warning and rejection kind a distinct title", () => {
    for (const c of REASON_CODES) expect(REASON_TITLES[c].trim()).not.toBe("");
    for (const c of WARNING_CODES) expect(WARNING_TITLES[c].trim()).not.toBe("");
    for (const c of REJECTION_KINDS) expect(REJECTION_TITLES[c].trim()).not.toBe("");
    expect(Object.keys(REASON_TITLES).sort()).toEqual([...REASON_CODES].sort());
    expect(unique(Object.values(REASON_TITLES))).toBe(true);
  });
});
