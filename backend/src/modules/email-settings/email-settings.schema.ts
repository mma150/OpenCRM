import { envelope, z } from "../../lib/openapi";
import { optionalEmailSchema, optionalText } from "../../lib/record-fields";

// The outgoing mail server in effect. The password is never part of an answer.
export const emailSettingsSchema = z
  .object({
    // DATABASE: saved here by an Admin. ENVIRONMENT: the SMTP_* environment variables.
    // NONE: email is off, and every other field is null or false.
    source: z.enum(["DATABASE", "ENVIRONMENT", "NONE"]),
    host: z.string().nullable(),
    port: z.number().int().nullable(),
    // true for implicit TLS (usually port 465); false for STARTTLS or plain.
    secure: z.boolean(),
    username: z.string().nullable(),
    hasPassword: z.boolean(),
    fromName: z.string().nullable(),
    fromAddress: z.string().nullable(),
    replyTo: z.string().nullable(),
    // null unless the settings were saved here.
    updatedAt: z.string().nullable(),
    // false when the server has no SETTINGS_ENCRYPTION_KEY: a password cannot be saved then.
    canStorePassword: z.boolean(),
    // true when a password is stored but cannot be read with the current key; it has to be
    // entered again.
    passwordUnreadable: z.boolean(),
  })
  .openapi("EmailSettings");

export type ApiEmailSettings = z.infer<typeof emailSettingsSchema>;

// A host name or an IP address: no scheme, no port, no path.
const hostSchema = z
  .string()
  .trim()
  .min(1, "Enter the mail server's host name")
  .max(253)
  .regex(/^[A-Za-z0-9.:[\]-]+$/, "Enter a host name such as smtp.example.com");

const addressSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email"));

export const updateEmailSettingsBodySchema = z
  .strictObject({
    host: hostSchema,
    port: z.number().int().min(1).max(65_535),
    secure: z.boolean().default(false),
    username: optionalText(200),
    // Left out: the stored password stays. null: it is removed. It is never sent back.
    password: z.string().min(1).max(500).nullable().optional(),
    // The name every email from the system is sent under; an email a user sends carries
    // the user's own name instead.
    fromName: optionalText(100).refine(
      (value) => !value || !/[<>"\r\n]/.test(value),
      'Leave out <, > and "',
    ),
    fromAddress: addressSchema,
    // Where an answer to a system email goes. An email a user sends is answered to the user.
    replyTo: optionalEmailSchema,
  })
  .openapi("UpdateEmailSettingsBody");

export type UpdateEmailSettingsBody = z.infer<typeof updateEmailSettingsBodySchema>;

export const testEmailBodySchema = z.strictObject({ to: addressSchema }).openapi("TestEmailBody");

export const testEmailResultSchema = z
  .object({ sent: z.boolean(), to: z.string() })
  .openapi("TestEmailResult");

export type TestEmailResult = z.infer<typeof testEmailResultSchema>;

// What every signed-in user may know: whether email works at all.
export const emailStatusSchema = z.object({ enabled: z.boolean() }).openapi("EmailStatus");

export type EmailStatus = z.infer<typeof emailStatusSchema>;

export const emailSettingsResponseSchema = envelope(emailSettingsSchema);
export const testEmailResponseSchema = envelope(testEmailResultSchema);
export const emailStatusResponseSchema = envelope(emailStatusSchema);
