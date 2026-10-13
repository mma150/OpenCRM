import { SEND_TIMEOUT_MS } from "@/features/email-settings/email-settings.api";
import type { TimelineEntry } from "@/features/timeline/timeline.types";
import { http } from "@/lib/api/http";

import type {
  EmailDefaults,
  EmailDefaultsResponse,
  EmailPreview,
  EmailPreviewResponse,
  EmailRecord,
  PreviewEmailInput,
  SendEmailInput,
  SendEmailResponse,
} from "./emails.types";

// Sends an email from a record and answers with the EMAIL timeline entry the API wrote.
// Nothing is written when email is off or the mail server refuses.
export async function sendEmail(input: SendEmailInput): Promise<TimelineEntry> {
  const response = await http.post<SendEmailResponse>("/emails", input, {
    timeout: SEND_TIMEOUT_MS,
  });
  return response.data.data;
}

// The subject and body with their placeholders filled in for this record. Sends nothing,
// and works while email is off.
export async function previewEmail(input: PreviewEmailInput): Promise<EmailPreview> {
  const response = await http.post<EmailPreviewResponse>("/emails/preview", input);
  return response.data.data;
}

// The addresses an email from this record usually goes to.
export async function getEmailDefaults(record: EmailRecord): Promise<EmailDefaults> {
  const response = await http.get<EmailDefaultsResponse>("/emails/defaults", {
    params: { recordType: record.type, recordId: record.id },
  });
  return response.data.data;
}
