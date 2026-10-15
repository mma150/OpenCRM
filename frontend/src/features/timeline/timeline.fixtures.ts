import { adminUser, repUser } from "@/test/render-with-store";

import type { RecordRef, TimelineEntry, TimelinePage } from "./timeline.types";

export const leadRecord: RecordRef = { type: "lead", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" };
export const otherRecord: RecordRef = { type: "lead", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" };
export const contactRecord: RecordRef = {
  type: "contact",
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
};
export const companyRecord: RecordRef = {
  type: "company",
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
};

const rob = { id: repUser.id, name: repUser.name };
const ada = { id: adminUser.id, name: adminUser.name };

function entry(id: number, fields: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: `eeeeeeee-eeee-4eee-8eee-${String(id).padStart(12, "0")}`,
    kind: "NOTE",
    conversationType: null,
    body: null,
    details: null,
    occurredAt: "2026-10-05T09:00:00.000Z",
    author: rob,
    createdAt: fields.occurredAt ?? "2026-10-05T09:00:00.000Z",
    fromLead: null,
    ...fields,
  };
}

// One entry of every kind, newest first, as the API returns them.
export const call = entry(1, {
  kind: "CONVERSATION",
  conversationType: "CALL",
  body: "Discussed fleet pricing.\nSend the proposal on Friday.",
  occurredAt: "2026-10-08T14:00:00.000Z",
});
export const meeting = entry(2, {
  kind: "CONVERSATION",
  conversationType: "MEETING",
  body: "Demo for the operations team.",
  occurredAt: "2026-10-07T15:00:00.000Z",
});
export const note = entry(3, {
  kind: "NOTE",
  body: "Budget authority up to $50k.",
  occurredAt: "2026-10-07T10:00:00.000Z",
  author: ada,
});
export const markedLost = entry(4, {
  kind: "STATUS_CHANGE",
  details: { from: "CONTACTED", to: "LOST", reason: "PRICE", note: "Too expensive this year." },
  occurredAt: "2026-10-06T16:00:00.000Z",
});
export const lostReasonUpdated = entry(5, {
  kind: "STATUS_CHANGE",
  details: { from: "LOST", to: "LOST", reason: "NO_BUDGET", note: null },
  occurredAt: "2026-10-06T15:00:00.000Z",
});
export const reassigned = entry(6, {
  kind: "ASSIGNMENT",
  details: { fromOwner: ada, toOwner: rob },
  occurredAt: "2026-10-06T12:00:00.000Z",
  author: ada,
});
export const statusChanged = entry(7, {
  kind: "STATUS_CHANGE",
  details: { from: "NEW", to: "CONTACTED" },
  occurredAt: "2026-10-06T11:00:00.000Z",
});
export const created = entry(8, {
  kind: "CREATED",
  occurredAt: "2026-10-05T09:00:00.000Z",
  author: ada,
});

// Entries of the email, quote and invoice API. They are not in `allEntries`, which the
// older tests count: a test that needs them asks for them by name.
export const QUOTE = { id: "99999999-9999-4999-8999-999999999991", number: "Q-0001" };
export const INVOICE = { id: "99999999-9999-4999-8999-999999999992", number: "INV-0001" };

export const emailSent = entry(20, {
  kind: "EMAIL",
  body: "Hi Marcus,\n\nHere is the recap of our demo.\n\nRob",
  details: {
    to: ["marcus.chen@acme.example", "ops@acme.example"],
    cc: ["mia@example.com"],
    subject: "Recap of our demo",
    status: "SENT",
    templateId: null,
    quote: null,
  },
  occurredAt: "2026-10-09T09:00:00.000Z",
});
export const emailWithQuote = entry(21, {
  kind: "EMAIL",
  body: "Please find our quote attached.",
  details: {
    to: ["marcus.chen@acme.example"],
    cc: [],
    subject: "Your quote",
    status: "SENT",
    templateId: null,
    quote: QUOTE,
    attachment: { filename: "Q-0001.pdf" },
  },
  occurredAt: "2026-10-09T10:00:00.000Z",
});

// A QUOTE_STATUS or INVOICE_STATUS entry, as the API writes it on the opportunity.
export function quoteStatus(from: string | null, to: string | null, id = 30): TimelineEntry {
  return entry(id, {
    kind: "QUOTE_STATUS",
    details: { quote: QUOTE, from, to, total: 4360.87 },
    occurredAt: "2026-10-09T11:00:00.000Z",
  });
}
export function invoiceStatus(from: string | null, to: string | null, id = 40): TimelineEntry {
  return entry(id, {
    kind: "INVOICE_STATUS",
    details: { invoice: INVOICE, from, to, total: 4360.87 },
    occurredAt: "2026-10-09T12:00:00.000Z",
  });
}

export const allEntries: TimelineEntry[] = [
  call,
  meeting,
  note,
  markedLost,
  lostReasonUpdated,
  reassigned,
  statusChanged,
  created,
];

// What the API answers to a save: a new entry, made now by the signed-in rep.
export function savedEntry(fields: Partial<TimelineEntry>): TimelineEntry {
  return entry(99, { occurredAt: new Date().toISOString(), ...fields });
}

export function timelinePage(
  entries: TimelineEntry[] = allEntries,
  meta: Partial<TimelinePage> = {},
): TimelinePage {
  return { entries, page: 1, pageSize: 25, total: entries.length, ...meta };
}
