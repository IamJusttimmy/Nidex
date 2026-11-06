import { DataFetchError } from "./errors";

/**
 * Fetches a text file (such as a CSV) exactly as the server sent it.
 * It returns the text untouched. Failures become typed DataFetchErrors.
 */
export async function fetchText(url: string): Promise<string> {
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

  try {
    return await response.text();
  } catch {
    throw new DataFetchError("network", "The download was interrupted.", url);
  }
}