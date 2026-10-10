import { z } from "zod";

// Field rules shared by every form. The server checks again and is the authority;
// these only save the user a round trip.
export const nameSchema = z.string().trim().min(1, "Enter a name.");

export const emailSchema = z.email("Enter a valid email address.");

export const PASSWORD_HINT = "At least 10 characters.";

// Length only, no forced character classes (D-05). The server also rejects very common passwords.
export const newPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.");
