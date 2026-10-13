import { managerUser } from "@/features/leads/leads.fixtures";
import { adminUser, repUser } from "@/test/render-with-store";

import type { EmailPlaceholder, EmailTemplate } from "./email-templates.types";

// Templates as the signed-in rep (Rob) gets them: by name, his own two first and last, a
// shared one of the manager's he may only use in between.
export const checkIn: EmailTemplate = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  name: "Checking in",
  subject: "Any questions, {{contact.firstName}}?",
  body: "Hi {{contact.firstName}},\n\nDid you get a chance to look at our proposal?\n\n{{sender.name}}",
  shared: false,
  owner: { id: repUser.id, name: repUser.name },
  editable: true,
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-05T09:00:00.000Z",
};

export const followUp: EmailTemplate = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  name: "Follow-up after demo",
  subject: "Recap of our demo for {{company.name}}",
  body: "Hi {{contact.firstName}},\n\nThank you for your time today.\n\n{{sender.name}}",
  shared: true,
  owner: { id: managerUser.id, name: managerUser.name },
  editable: false,
  createdAt: "2026-10-06T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

export const thanks: EmailTemplate = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
  name: "Thanks for the call",
  subject: "Thanks for the call",
  body: "Thanks for the call earlier.",
  shared: false,
  owner: { id: repUser.id, name: repUser.name },
  editable: true,
  createdAt: "2026-10-07T09:00:00.000Z",
  updatedAt: "2026-10-07T09:00:00.000Z",
};

export const templates: EmailTemplate[] = [checkIn, followUp, thanks];

// The same list as an Admin (Ada) gets it: she may change the shared one, and owns one.
export const adminTemplates: EmailTemplate[] = [
  { ...followUp, editable: true },
  { ...thanks, owner: { id: adminUser.id, name: adminUser.name }, shared: true },
];

export const placeholders: EmailPlaceholder[] = [
  {
    key: "contact.firstName",
    token: "{{contact.firstName}}",
    label: "Contact's first name",
    description: "The lead's or contact's first name.",
  },
  {
    key: "company.name",
    token: "{{company.name}}",
    label: "Company name",
    description: "The company of the record.",
  },
  {
    key: "sender.name",
    token: "{{sender.name}}",
    label: "Your name",
    description: "The person sending the email.",
  },
  {
    key: "quote.number",
    token: "{{quote.number}}",
    label: "Quote number",
    description: "Only on an email sent with a quote.",
  },
  {
    key: "quote.total",
    token: "{{quote.total}}",
    label: "Quote total",
    description: "Only on an email sent with a quote.",
  },
];
