import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";

type FieldDetail = { path: string; message: string };

function isFieldDetail(value: unknown): value is FieldDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

// Puts the server's VALIDATION_FAILED details onto the matching form fields.
// Returns the message to show above the form, or null when every problem landed on a field.
export function applyServerError<Values extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<Values>,
  fields: readonly Path<Values>[],
): string | null {
  if (error.code !== "VALIDATION_FAILED" || !Array.isArray(error.details)) {
    return describeApiError(error);
  }

  let unplaced = 0;
  for (const detail of error.details as unknown[]) {
    const field = isFieldDetail(detail) ? fields.find((name) => name === detail.path) : undefined;
    if (field && isFieldDetail(detail)) {
      setError(field, { type: "server", message: detail.message });
    } else {
      unplaced += 1;
    }
  }
  return unplaced > 0 || error.details.length === 0 ? describeApiError(error) : null;
}
