import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError, type ErrorCode } from "../lib/app-error";

interface ErrorBody {
  status: number;
  code: ErrorCode;
  message: string;
  details: unknown;
}

// express.json() raises a SyntaxError tagged with this type for a malformed body.
function isBodyParseError(err: unknown): boolean {
  return err instanceof SyntaxError && "type" in err && err.type === "entity.parse.failed";
}

// ...and an error tagged with this type for a body over the size limit set in app.ts.
function isBodyTooLargeError(err: unknown): boolean {
  return err instanceof Error && "type" in err && err.type === "entity.too.large";
}

function toErrorBody(err: unknown): ErrorBody {
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  if (isBodyParseError(err)) {
    return {
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Request body is not valid JSON",
      details: null,
    };
  }
  if (isBodyTooLargeError(err)) {
    return {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body is too large",
      details: null,
    };
  }
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  // Unknown failures never expose their message or stack to the caller (T-05-01).
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: null,
  };
}

// Four arguments are what mark this as Express error middleware.
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, code, message, details } = toErrorBody(err);
  if (status >= 500 && err instanceof Error) {
    // pino-http writes this error, with its stack, on the request's single log line.
    res.err = err;
  }
  res.status(status).json({ error: { code, message, details } });
}
