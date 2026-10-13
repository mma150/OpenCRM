import { http } from "@/lib/api/http";

import type {
  EmailSettings,
  EmailSettingsResponse,
  EmailStatus,
  EmailStatusResponse,
  TestEmailResponse,
  TestEmailResult,
  UpdateEmailSettingsInput,
} from "./email-settings.types";

// Whether outgoing email is on. For every signed-in user.
export async function getEmailStatus(): Promise<EmailStatus> {
  const response = await http.get<EmailStatusResponse>("/settings/email/status");
  return response.data.data;
}

// The mail server in effect and where it comes from (Admin).
export async function getEmailSettings(): Promise<EmailSettings> {
  const response = await http.get<EmailSettingsResponse>("/settings/email");
  return response.data.data;
}

// Replaces the saved settings. Nothing is sent.
export async function saveEmailSettings(input: UpdateEmailSettingsInput): Promise<EmailSettings> {
  const response = await http.put<EmailSettingsResponse>("/settings/email", input);
  return response.data.data;
}

// Forgets the saved settings; answers with what is in effect then (the environment's, or none).
export async function removeEmailSettings(): Promise<EmailSettings> {
  const response = await http.delete<EmailSettingsResponse>("/settings/email");
  return response.data.data;
}

// A mail server can take a while to answer or to refuse (the API waits up to 20 seconds
// for it), so sending waits longer than the usual 10 seconds.
export const SEND_TIMEOUT_MS = 45_000;

// Sends one message with the settings in effect.
export async function sendTestEmail(to: string): Promise<TestEmailResult> {
  const response = await http.post<TestEmailResponse>(
    "/settings/email/test",
    { to },
    { timeout: SEND_TIMEOUT_MS },
  );
  return response.data.data;
}
