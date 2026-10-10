// The complete list of error codes clients can switch on (D-12).
// Adding a code is fine; renaming or removing one breaks every client.
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_LOCKED",
  "RATE_LIMITED",
  "INVALID_TOKEN",
  "SETUP_CLOSED",
  "EMAIL_IN_USE",
  "LAST_ADMIN",
  "PAYLOAD_TOO_LARGE",
  "LEAD_CONVERTED",
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

// A rule a service checks about one field (the owner cannot be assigned to, the company is
// not one the caller can see). Same shape as a Zod failure, so a form shows the message
// beside the field.
export function fieldError(path: string, message: string): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed", [{ path, message }]);
}
