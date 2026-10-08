// The complete list of error codes clients can switch on (D-12).
// Adding a code is fine; renaming or removing one breaks every client.
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// Throw this for failures the API expects. The error handler turns it into
// { error: { code, message, details } } with the given HTTP status.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    details: unknown = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
