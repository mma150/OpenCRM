import { z } from "zod";

import type { Role } from "@/lib/user-labels";

// The same limits as the API, to save a round trip. The server checks again.
export const MAX_TEMPLATE_NAME = 100;
export const MAX_EMAIL_SUBJECT = 200;
export const MAX_EMAIL_BODY = 20_000;
// How many templates one person can own.
export const MAX_TEMPLATES = 200;

// The subject and the body of a template and of an email follow one rule, so the template
// dialog and the composer share these.
export const emailSubjectSchema = z
  .string()
  .trim()
  .min(1, "Enter a subject.")
  .max(MAX_EMAIL_SUBJECT, `Use ${String(MAX_EMAIL_SUBJECT)} characters or fewer.`)
  .regex(/^[^\r\n]*$/, "Keep the subject on one line.");

export const emailBodySchema = z
  .string()
  .max(MAX_EMAIL_BODY, `Use ${MAX_EMAIL_BODY.toLocaleString("en-US")} characters or fewer.`)
  .refine((value) => value.trim() !== "", "Write the message.");

// What a role may do with email templates. A Read-only user sends no email and so has no
// templates page; only an Admin and a Sales Manager may share a template with everyone.
// The API enforces all of this; the UI only avoids offering what would be refused.
export function templateAccess(role: Role): { canUse: boolean; canShare: boolean } {
  return {
    canUse: role !== "READ_ONLY",
    canShare: role === "ADMIN" || role === "SALES_MANAGER",
  };
}
