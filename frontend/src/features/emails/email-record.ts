import type { RecordRef, RecordType } from "@/features/timeline/record-types";

import type { EmailRecord, EmailRecordType } from "./emails.types";

// The email API names a record's type in capitals ("LEAD"); the timeline and the record
// pages use the app's own names ("lead"). These two tables are the one place that turns
// one into the other; TypeScript asks for a line when a record type is added.
const EMAIL_TYPE_OF: Record<RecordType, EmailRecordType> = {
  lead: "LEAD",
  contact: "CONTACT",
  company: "COMPANY",
  opportunity: "OPPORTUNITY",
};

const RECORD_TYPE_OF: Record<EmailRecordType, RecordType> = {
  LEAD: "lead",
  CONTACT: "contact",
  COMPANY: "company",
  OPPORTUNITY: "opportunity",
};

// A record page's `{ type: "lead", id }` as the email API takes it.
export function emailRecordOf(record: RecordRef): EmailRecord {
  return { type: EMAIL_TYPE_OF[record.type], id: record.id };
}

// And back: the record whose timeline an email from `record` is written on.
export function recordRefOf(record: EmailRecord): RecordRef {
  return { type: RECORD_TYPE_OF[record.type], id: record.id };
}
