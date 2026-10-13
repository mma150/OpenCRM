import { http } from "@/lib/api/http";

import type {
  CreateEmailTemplateInput,
  CreateEmailTemplateResponse,
  EmailPlaceholder,
  EmailPlaceholdersResponse,
  EmailTemplate,
  EmailTemplateResponse,
  EmailTemplatesResponse,
  UpdateEmailTemplateInput,
} from "./email-templates.types";

// The signed-in user's own templates and every shared one, by name. Not paged.
export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const response = await http.get<EmailTemplatesResponse>("/email-templates");
  return response.data.data;
}

// The placeholders the API fills in when an email is sent.
export async function listEmailPlaceholders(): Promise<EmailPlaceholder[]> {
  const response = await http.get<EmailPlaceholdersResponse>("/email-templates/placeholders");
  return response.data.data;
}

export async function createEmailTemplate(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
  const response = await http.post<CreateEmailTemplateResponse>("/email-templates", input);
  return response.data.data;
}

export async function updateEmailTemplate(
  id: string,
  input: UpdateEmailTemplateInput,
): Promise<EmailTemplate> {
  const response = await http.patch<EmailTemplateResponse>(`/email-templates/${id}`, input);
  return response.data.data;
}

// For real: emails already sent keep their own text.
export async function deleteEmailTemplate(id: string): Promise<void> {
  await http.delete(`/email-templates/${id}`);
}
