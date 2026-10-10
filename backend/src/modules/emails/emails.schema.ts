import { envelope, z } from "../../lib/openapi";
import { emailBodySchema, emailSubjectSchema } from "../email-templates/email-templates.schema";

// The kinds of record an email can be sent from.
export const emailRecordTypeSchema = z
  .enum(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"])
  .openapi("EmailRecordType");

export type EmailRecordType = z.infer<typeof emailRecordTypeSchema>;

const recordSchema = z.strictObject({ type: emailRecordTypeSchema, id: z.uuid() });

export type EmailRecord = z.infer<typeof recordSchema>;

// The most addresses in `to`, and again in `cc`.
export const MAX_RECIPIENTS = 10;

const addressSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email"));

// Exported for sending a quote, which takes the same four fields.
export const emailMessageFields = {
  to: z.array(addressSchema).min(1, "Add a recipient").max(MAX_RECIPIENTS),
  cc: z.array(addressSchema).max(MAX_RECIPIENTS).optional(),
  // Both may hold {{placeholders}}; the server fills them in when it sends.
  subject: emailSubjectSchema,
  body: emailBodySchema,
};

export const sendEmailBodySchema = z
  .strictObject({
    // The record the email is sent from; it appears on this record's timeline.
    record: recordSchema,
    ...emailMessageFields,
    // The template the text started from, if any. Only remembered on the timeline entry:
    // what is sent is the subject and body of this request.
    templateId: z.uuid().optional(),
  })
  .openapi("SendEmailBody");

export type SendEmailBody = z.infer<typeof sendEmailBodySchema>;

// A subject and a body as typed, possibly unfinished.
export const previewEmailBodySchema = z
  .strictObject({
    record: recordSchema,
    subject: z.string().max(200),
    body: z.string().max(20_000),
  })
  .openapi("PreviewEmailBody");

export type PreviewEmailBody = z.infer<typeof previewEmailBodySchema>;

export const emailPreviewSchema = z
  .object({
    // With every placeholder filled in, as the email would be sent.
    subject: z.string(),
    body: z.string(),
    // Placeholders that are not supported, such as "contact.nickname". Left as typed.
    unknown: z.array(z.string()),
    // Supported placeholders this record has no value for. Replaced by nothing.
    empty: z.array(z.string()),
  })
  .openapi("EmailPreview");

export type EmailPreview = z.infer<typeof emailPreviewSchema>;

export const emailDefaultsQuerySchema = z.object({
  recordType: emailRecordTypeSchema,
  recordId: z.uuid(),
});

export type EmailDefaultsQuery = z.infer<typeof emailDefaultsQuerySchema>;

export const emailDefaultsSchema = z
  .object({
    // Who the email would usually go to, for the form to offer: a lead's own address, a
    // contact's, the contacts of a company that have one (by name, at most 50), an
    // opportunity's contact. Empty when there is none.
    recipients: z.array(
      z.object({
        name: z.string(),
        email: z.string(),
        // null for a lead, which is not a contact.
        contactId: z.string().nullable(),
      }),
    ),
  })
  .openapi("EmailDefaults");

export type EmailDefaults = z.infer<typeof emailDefaultsSchema>;

export const emailDefaultsResponseSchema = envelope(emailDefaultsSchema);
export const emailPreviewResponseSchema = envelope(emailPreviewSchema);
