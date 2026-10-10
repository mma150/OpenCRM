// Every kind of record that has a timeline. The timeline feature, the record pages and the
// activity feed all read this one table, so a new record type is ONE line here, plus one in
// `RECORD_TYPE_OF` in `activity-labels.ts` for the name the API gives it in the feed.
// TypeScript points at that second line when it is missing.
export const RECORD_TYPES = {
  // label: what the record is called ("Lead created"); path: where it lives, in the API
  // (`/leads/:id/timeline`) and in the app (`/leads/:id`).
  lead: { label: "Lead", path: "leads" },
  contact: { label: "Contact", path: "contacts" },
  company: { label: "Company", path: "companies" },
  // The API already writes opportunity entries into the activity feed, so the type is
  // known here. Its pages (/opportunities/:id) come with the opportunities feature.
  opportunity: { label: "Opportunity", path: "opportunities" },
} as const;

export type RecordType = keyof typeof RECORD_TYPES;

// The record a timeline belongs to. The timeline does not know what a lead or a contact is:
// a record page hands it one of these.
export type RecordRef = { type: RecordType; id: string };

// What the record is called: "Lead", "Contact", "Company", "Opportunity".
export function recordLabel(type: RecordType): string {
  return RECORD_TYPES[type].label;
}

// The record's page in the app, and (under /api/v1) the record in the API.
export function recordPath(record: RecordRef): string {
  return `/${RECORD_TYPES[record.type].path}/${record.id}`;
}
