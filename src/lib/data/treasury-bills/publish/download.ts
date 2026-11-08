import { PublishRefusal } from "./guards";
import { PUBLISH_LIMITS } from "./limits";

export interface DownloadOptions {
  url: string;
  /** Injected so the logic can be tested without a network. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  attempts?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Node's fetch only says "fetch failed"; the real reason (DNS, TLS, reset) is in `cause`. Keep it. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return `${error.message}: ${code ? `${code} ` : ""}${cause.message}`.trim();
  }
  return error.message;
}

const normalHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

/**
 * Download the response body. Network errors, timeouts and 5xx/429 answers are retried with a growing pause.
 * Anything else that is not a plain 200 (a 403 challenge, a 404) is refused at once: retrying a block only
 * makes it worse. A redirect to a different site is refused.
 */
export async function downloadText(options: DownloadOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBodyBytes ?? PUBLISH_LIMITS.maxBodyBytes;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastProblem = "no attempt was made";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(options.url, {
        headers: { Accept: "application/json", "User-Agent": "Nidex-data-fetcher/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.url && normalHost(new URL(res.url).hostname) !== normalHost(new URL(options.url).hostname)) {
        throw new PublishRefusal("wrong_host", `The request was redirected to a different site (${new URL(res.url).hostname}).`);
      }
      if (res.status === 429 || res.status >= 500) {
        lastProblem = `HTTP ${res.status}`;
      } else if (res.status !== 200) {
        throw new PublishRefusal(
          "bad_status",
          `CBN answered HTTP ${res.status}${res.status === 403 ? " (the request was blocked)" : ""}. Not retrying.`,
        );
      } else {
        const declared = Number(res.headers.get("content-length") ?? "0");
        if (declared > maxBytes) throw new PublishRefusal("too_large", `The response declares ${declared} bytes; the limit is ${maxBytes}.`);
        const text = await res.text();
        if (Buffer.byteLength(text, "utf8") > maxBytes) throw new PublishRefusal("too_large", `The response is larger than ${maxBytes} bytes.`);
        return text;
      }
    } catch (error) {
      if (error instanceof PublishRefusal) throw error;
      lastProblem = describeError(error);
    }
    if (attempt < attempts) await sleep(1_000 * 2 ** (attempt - 1));
  }
  throw new PublishRefusal("download_failed", `The download failed after ${attempts} attempts (${lastProblem}).`);
}