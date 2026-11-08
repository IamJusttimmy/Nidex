import { buildNtbQualityReport, DEFAULT_RULES, type NtbRules } from "../quality";
import { buildDocument, isUnchanged, readPreviousDocument, serializeDocument, type PublishedNtbDocument } from "./document";
import { checkNotRegressing, checkQuality, checkStructure, parseResponseBody } from "./guards";
import { PUBLISH_LIMITS, type PublishLimits } from "./limits";

export interface PlanInput {
  /** The response body exactly as downloaded. */
  text: string;
  fetchedAt: string;
  endpoint: string;
  origin: "network" | "file";
  /** The current contents of the published file, or null if there is none yet. */
  previousText: string | null;
  allowRegression?: boolean;
  rules?: NtbRules;
  limits?: PublishLimits;
}

export type Publication =
  | { action: "unchanged"; document: PublishedNtbDocument; previous: PublishedNtbDocument }
  | { action: "publish"; document: PublishedNtbDocument; serialized: string; previous: PublishedNtbDocument | null };

/**
 * Decide what to publish. This is a pure function: it reads text and returns text. It never touches the
 * disk, so a failure at any step (it throws PublishRefusal) cannot alter the published file. Nothing is
 * written until the caller has the complete, serialized result in hand.
 */
export function planPublication(input: PlanInput): Publication {
  const limits = input.limits ?? PUBLISH_LIMITS;
  const rules = input.rules ?? DEFAULT_RULES;

  // 1. The last good file must be readable, or we stop and leave it for a person to look at.
  const previous = input.previousText === null ? null : readPreviousDocument(input.previousText);

  // 2. The download must look like the CBN feed.
  const records = parseResponseBody(input.text);
  checkStructure(records, limits);

  // 3. Run the checker on the whole feed and judge the result.
  const report = buildNtbQualityReport(records, rules);
  checkQuality(report, limits);

  // 4. Build the document and compare it with the last good one.
  const document = buildDocument({
    records,
    report,
    endpoint: input.endpoint,
    origin: input.origin,
    fetchedAt: input.fetchedAt,
    rules,
  });
  if (previous !== null) {
    checkNotRegressing(document.source, previous.source, { allowRegression: input.allowRegression, limits });
    if (isUnchanged(document, previous)) return { action: "unchanged", document, previous };
  }

  // 5. Serialize completely (and check it reads back) before anything is written.
  const serialized = serializeDocument(document);
  return { action: "publish", document, serialized, previous };
}