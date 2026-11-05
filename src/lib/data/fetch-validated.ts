import type { z } from "zod";
import { DataFetchError } from "./errors";

/**
 * Fetches JSON and checks it against a schema. It never returns data that
 * failed the check: every failure becomes a typed DataFetchError.
 */
export async function fetchValidated<T>(
  url: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new DataFetchError("network", "Could not reach the data source.", url);
  }

  if (!response.ok) {
    throw new DataFetchError(
      "http",
      `The data source responded with status ${response.status}.`,
      url,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DataFetchError(
      "parse",
      "The data source returned something that is not valid JSON.",
      url,
    );
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new DataFetchError(
      "validation",
      "The data source returned data in an unexpected shape.",
      url,
    );
  }
  return result.data;
}