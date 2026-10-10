import type { Prisma } from "../../generated/prisma/client";
import { AppError, notFoundAsFieldError } from "../../lib/app-error";
import { deliverMail, MailError, type MailMessage } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { type Actor, assertCanWrite, visibleLiveRecords } from "../../lib/record-access";
import {
  addTimelineEntry,
  type ApiTimelineEntry,
  type RecordRef,
  type TimelineEntryWithAuthor,
  toApiTimelineEntry,
} from "../../lib/timeline";
import { findCompany } from "../companies/companies.service";
import { findContact } from "../contacts/contacts.service";
import {
  findTemplate,
  type PlaceholderValues,
  renderPlaceholders,
} from "../email-templates/email-templates.service";
import { findLead } from "../leads/leads.service";
import { findOpportunity } from "../opportunities/opportunities.service";
import { moveLastContactAt } from "../timeline/timeline.service";
import type {
  EmailDefaults,
  EmailPreview,
  EmailRecord,
  PreviewEmailBody,
  SendEmailBody,
} from "./emails.schema";

// MAIL-02 and MAIL-03: an email a user sends from a record. It goes out through the
// organisation's mail server under the user's own name, with the user's address as
// Reply-To, and is written on the record's timeline once the mail server has taken it.

// The signed-in user as a sender: a Prisma `User` fits.
export type Sender = Actor & { name: string; email: string };

type Recipient = EmailDefaults["recipients"][number];

// What an email needs to know about the record it is sent from.
interface RecordContext {
  ref: RecordRef;
  values: PlaceholderValues;
  recipients: Recipient[];
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

// Each record is looked up through its own service, so one the caller may not see is
// NOT_FOUND here as everywhere else. A linked contact or company is only used when the
// caller may see it too.
async function loadRecord(actor: Actor, record: EmailRecord): Promise<RecordContext> {
  const visible = visibleLiveRecords(actor);
  switch (record.type) {
    case "LEAD": {
      const lead = await findLead(actor, record.id);
      return {
        ref: { type: "lead", id: lead.id },
        values: {
          "contact.firstName": lead.firstName,
          "contact.lastName": lead.lastName,
          "company.name": lead.company,
        },
        recipients: lead.email
          ? [{ name: fullName(lead), email: lead.email, contactId: null }]
          : [],
      };
    }
    case "CONTACT": {
      const contact = await findContact(actor, record.id);
      return {
        ref: { type: "contact", id: contact.id },
        values: {
          "contact.firstName": contact.firstName,
          "contact.lastName": contact.lastName,
          "company.name": contact.company?.name,
        },
        recipients: contact.email
          ? [{ name: fullName(contact), email: contact.email, contactId: contact.id }]
          : [],
      };
    }
    case "COMPANY": {
      const company = await findCompany(actor, record.id);
      const contacts = await prisma.contact.findMany({
        where: { companyId: company.id, email: { not: null }, ...visible },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
        take: 50,
      });
      return {
        ref: { type: "company", id: company.id },
        values: { "company.name": company.name },
        recipients: contacts.flatMap((contact) =>
          contact.email
            ? [{ name: fullName(contact), email: contact.email, contactId: contact.id }]
            : [],
        ),
      };
    }
    case "OPPORTUNITY": {
      const opportunity = await findOpportunity(actor, record.id);
      // findOpportunity names the contact only when the caller may see it.
      const contact = opportunity.contact
        ? await prisma.contact.findUnique({ where: { id: opportunity.contact.id } })
        : null;
      return {
        ref: { type: "opportunity", id: opportunity.id },
        values: {
          "opportunity.name": opportunity.name,
          "contact.firstName": contact?.firstName,
          "contact.lastName": contact?.lastName,
          "company.name": opportunity.company?.name,
        },
        recipients: contact?.email
          ? [{ name: fullName(contact), email: contact.email, contactId: contact.id }]
          : [],
      };
    }
  }
}

function senderValues(sender: Sender): PlaceholderValues {
  return { "sender.name": sender.name, "sender.email": sender.email };
}

// Who an email from this record would usually go to.
export async function getEmailDefaults(actor: Actor, record: EmailRecord): Promise<EmailDefaults> {
  const { recipients } = await loadRecord(actor, record);
  return { recipients };
}

// The subject and the body with their placeholders filled in, without sending anything.
export async function previewEmail(sender: Sender, input: PreviewEmailBody): Promise<EmailPreview> {
  const { values } = await loadRecord(sender, input.record);
  const all = { ...values, ...senderValues(sender) };
  const subject = renderPlaceholders(input.subject, all);
  const body = renderPlaceholders(input.body, all);
  return {
    subject: subject.text,
    body: body.text,
    unknown: [...new Set([...subject.unknown, ...body.unknown])],
    empty: [...new Set([...subject.empty, ...body.empty])],
  };
}

// Hands a message to the mail server and waits for its answer, with a failure as one of the
// API's coded errors. Exported for the routes that send for a waiting person: the test
// message of the email settings, and a quote.
export async function deliverEmail(message: MailMessage): Promise<void> {
  try {
    await deliverMail(message);
  } catch (error) {
    if (!(error instanceof MailError)) {
      throw error;
    }
    if (error.reason === "NOT_CONFIGURED") {
      throw new AppError(
        "EMAIL_NOT_CONFIGURED",
        409,
        "Outgoing email is not set up. Ask an Admin to add a mail server in the settings.",
      );
    }
    // The message is one of the mailer's own sentences, never the mail server's text.
    throw new AppError("EMAIL_SEND_FAILED", 502, error.message, null, { cause: error });
  }
}

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}

// The message as it goes out: placeholders filled in, every address once, the sender's name
// in front of the organisation's address and the sender's own address as Reply-To.
export function composeEmail(sender: Sender, email: OutgoingEmail, values: PlaceholderValues) {
  const all = { ...values, ...senderValues(sender) };
  const to = [...new Set(email.to)];
  const cc = [...new Set(email.cc)].filter((address) => !to.includes(address));
  // A value that was filled in must not break the subject line.
  const subject = renderPlaceholders(email.subject, all)
    .text.replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const body = renderPlaceholders(email.body, all).text;
  const message: MailMessage = {
    to,
    cc,
    subject,
    text: body,
    fromName: sender.name,
    replyTo: sender.email,
  };
  return { to, cc, subject, body, message };
}

// The EMAIL entry of an email that was sent. Like a conversation, it moves the record's
// `lastContactAt`. `quote` names the quote the email carried, if any.
export async function addEmailEntry(
  tx: Prisma.TransactionClient,
  authorId: string,
  record: RecordRef,
  email: { to: string[]; cc: string[]; subject: string; body: string },
  extra: { templateId?: string; quote?: { id: string; number: string } } = {},
): Promise<TimelineEntryWithAuthor> {
  const occurredAt = new Date();
  await moveLastContactAt(tx, record, occurredAt);
  return addTimelineEntry(tx, {
    kind: "EMAIL",
    authorId,
    record,
    body: email.body,
    occurredAt,
    details: {
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      // Only an email the mail server accepted is written down.
      status: "SENT",
      templateId: extra.templateId ?? null,
      quote: extra.quote ?? null,
    },
  });
}

// A converted or lost lead and a closed opportunity still take email: people keep talking.
export async function sendEmail(sender: Sender, input: SendEmailBody): Promise<ApiTimelineEntry> {
  assertCanWrite(sender);
  const { ref, values } = await loadRecord(sender, input.record);
  if (input.templateId) {
    await findTemplate(sender, input.templateId).catch(
      notFoundAsFieldError("templateId", "Choose a template you can see"),
    );
  }

  const email = composeEmail(sender, input, values);
  // First the mail server, then the timeline: an entry is only written for an email that
  // went out. When sending fails, the error is answered and nothing is stored.
  await deliverEmail(email.message);
  const entry = await prisma.$transaction((tx) =>
    addEmailEntry(tx, sender.id, ref, email, { templateId: input.templateId }),
  );
  return toApiTimelineEntry(entry);
}
