import { z } from "./openapi";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password";

// Field schemas shared by the auth and users modules, so both apply the same rules.

export const ROLES = ["ADMIN", "SALES_MANAGER", "SALES_REP", "READ_ONLY"] as const;

export const roleSchema = z.enum(ROLES).openapi("Role");

// Control characters are refused so a name can never break an email header or a log line.
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(100)
  .regex(/^\P{Cc}*$/u, "Remove the control characters from the name");

// Emails are compared and stored trimmed and lowercased.
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

// Length only (D-05). The common-password check runs in the service; the password
// itself is never trimmed or changed.
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH);

// The token from an invite or password-reset link.
export const linkTokenSchema = z.string().min(1).max(200);
