export type DataFetchErrorKind = "network" | "http" | "parse" | "validation";

export class DataFetchError extends Error {
  readonly kind: DataFetchErrorKind;
  readonly url: string;

  constructor(kind: DataFetchErrorKind, message: string, url: string) {
    super(message);
    this.name = "DataFetchError";
    this.kind = kind;
    this.url = url;
  }
}