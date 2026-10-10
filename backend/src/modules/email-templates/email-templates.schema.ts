import { envelope, z } from "../../lib/openapi";

export const emailTemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    // Plain text; both may hold {{placeholders}}.
    subject: z.string(),
    body: z.string(),
    // A shared template is offered to everyone; any other only to its owner.
    shared: z.boolean(),
    owner: z.object({ id: z.string(), name: z.string() }),
    // Whether the caller may change or delete it: its owner, or an Admin for a shared one.
    editable: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("EmailTemplate");

export type ApiEmailTemplate = z.infer<typeof emailTemplateSchema>;

// The most templates one user can own.
export const MAX_TEMPLATES_PER_USER = 200;

const nameSchema = z.string().trim().min(1, "Enter a name").max(100);
// One line: a subject cannot hold a line break.
export const emailSubjectSchema = z
  .string()
  .trim()
  .min(1, "Enter a subject")
  .max(200)
  .regex(/^[^\r\n]*$/, "A subject is a single line");
export const emailBodySchema = z.string().trim().min(1, "Write the message").max(20_000);

export const createEmailTemplateBodySchema = z
  .strictObject({
    name: nameSchema,
    subject: emailSubjectSchema,
    body: emailBodySchema,
    // Only an Admin or a Sales Manager may share a template. Defaults to false.
    shared: z.boolean().optional(),
  })
  .openapi("CreateEmailTemplateBody");

export type CreateEmailTemplateBody = z.infer<typeof createEmailTemplateBodySchema>;

// Only the keys that are sent are changed.
export const updateEmailTemplateBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    subject: emailSubjectSchema.optional(),
    body: emailBodySchema.optional(),
    shared: z.boolean().optional(),
  })
  .openapi("UpdateEmailTemplateBody");

export type UpdateEmailTemplateBody = z.infer<typeof updateEmailTemplateBodySchema>;

// The values a template can pull in when an email is sent.
export const PLACEHOLDERS = [
  {
    key: "contact.firstName",
    label: "Contact's first name",
    description: "The lead's or contact's first name; an opportunity's contact.",
  },
  {
    key: "contact.lastName",
    label: "Contact's last name",
    description: "The lead's or contact's last name; an opportunity's contact.",
  },
  {
    key: "company.name",
    label: "Company name",
    description: "The company of the record; for a lead, the company typed on it.",
  },
  {
    key: "opportunity.name",
    label: "Opportunity name",
    description: "Only on an email sent from an opportunity or with a quote.",
  },
  { key: "sender.name", label: "Your name", description: "The person sending the email." },
  { key: "sender.email", label: "Your email", description: "The sender's own address." },
  {
    key: "quote.number",
    label: "Quote number",
    description: "Only on an email sent with a quote, such as Q-0042.",
  },
  {
    key: "quote.total",
    label: "Quote total",
    description: "Only on an email sent with a quote, such as $1,250.00.",
  },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];

export const placeholderSchema = z
  .object({
    // "contact.firstName"
    key: z.string(),
    // What to type: "{{contact.firstName}}"
    token: z.string(),
    label: z.string(),
    description: z.string(),
  })
  .openapi("EmailPlaceholder");

export type ApiPlaceholder = z.infer<typeof placeholderSchema>;

export const emailTemplateResponseSchema = envelope(emailTemplateSchema);
export const emailTemplatesResponseSchema = envelope(z.array(emailTemplateSchema));
export const placeholdersResponseSchema = envelope(z.array(placeholderSchema));
