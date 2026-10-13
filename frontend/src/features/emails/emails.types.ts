import type { components, paths } from "@/lib/api/schema";

type Schemas = components["schemas"];

// "LEAD", "CONTACT", "COMPANY" or "OPPORTUNITY": the record an email is sent from.
export type EmailRecordType = Schemas["EmailRecordType"];
export type EmailRecord = Schemas["SendEmailBody"]["record"];

// POST /emails: 1 to 10 `to` addresses, up to 10 `cc`. There is no from, bcc or attachment.
export type SendEmailInput = Schemas["SendEmailBody"];
export type PreviewEmailInput = Schemas["PreviewEmailBody"];
// The text with its placeholders filled in. `unknown` are placeholders the API does not
// know (they stay in the text as typed); `empty` are known ones this record has no value for.
export type EmailPreview = Schemas["EmailPreview"];
// Who an email from this record would usually go to.
export type EmailDefaults = Schemas["EmailDefaults"];
export type EmailRecipient = EmailDefaults["recipients"][number];

// What a composer hands over when the user presses Send: the same for an email from a
// record (POST /emails) and for a quote sent by email (POST /quotes/:id/send).
export type EmailMessage = Pick<SendEmailInput, "to" | "cc" | "subject" | "body" | "templateId">;

// Response bodies: { data, meta }.
export type SendEmailResponse =
  paths["/emails"]["post"]["responses"]["201"]["content"]["application/json"];
export type EmailPreviewResponse =
  paths["/emails/preview"]["post"]["responses"]["200"]["content"]["application/json"];
export type EmailDefaultsResponse =
  paths["/emails/defaults"]["get"]["responses"]["200"]["content"]["application/json"];
