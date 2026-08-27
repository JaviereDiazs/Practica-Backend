// Business modules throw these, never `HttpException` — the domain doesn't
// know HTTP exists. DomainExceptionFilter is the single place that translates
// a `code` + subclass into a status code.
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
