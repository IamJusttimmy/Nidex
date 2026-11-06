import type { VerificationOverride } from "./verification";

/**
 * Recorded outcomes of checking flagged observations against outside sources.
 * Each entry says what was checked and why the status is what it is, so it can be re-checked.
 * Adding or removing an entry never changes a value or a quality status.
 */
export const VERIFICATION_OVERRIDES: VerificationOverride[] = [
  {
    date: "2023-12-22",
    code: "*",
    status: "unresolved",
    note:
      "Nine currencies jump 20-25% together on this date and return on the next one. Independently reported NAFEM closing rates do not show a move this size: 21 Dec 861.91, 22 Dec 885.88 per dollar, against the CBN-published USD mid of 840.91 and 1,039.13. The CBN rates page labels its figures \"Weighted Average Rate - Nigerian Foreign Exchange Market (NFEM)\", which is not the same measure as a closing rate, so the comparison is not like for like and this is not confirmed as an error either.",
    sources: [
      "https://nairametrics.com/2023/12/22/intraday-high-records-n1249-1-as-naira-further-weakens-marginally-at-official-market/",
      "https://nairametrics.com/2023/12/22/naira-falls-against-dollar-to-n885-88-1-as-forex-turnover-drops-by-22-ahead-of-christmas/",
    ],
  },
];
