"use client";

import { User } from "lucide-react";

import {
  type PickedRecord,
  RecordFilter,
  RecordPicker,
  type RecordPickerKind,
} from "@/components/shared/record-picker";

import { getContact, listContacts } from "./contacts.api";

// A contact as another record names it (an opportunity's contact) and as the picker hands it over.
export type ContactRef = PickedRecord;

// What the shared record picker needs to know about contacts: what they are called and how
// to search them (GET /contacts?search=, by name). Each match shows its company under the
// name, because two people can share one.
const CONTACT: RecordPickerKind = {
  label: "Contact",
  noun: "contact",
  plural: "contacts",
  icon: User,
  search: async (text, pageSize) => {
    const list = await listContacts({
      ...(text ? { search: text } : {}),
      sort: "name",
      order: "asc",
      page: 1,
      pageSize,
    });
    return {
      matches: list.contacts.map(({ id, name, company }) => ({ id, name, detail: company?.name })),
      total: list.total,
    };
  },
  find: getContact,
};

// Chooses one contact from all the contacts the user may see, by searching for a name. It is
// the same picker as the company's (see `CompanyPicker`), and is used the same way:
//
//   <ContactPicker id={id} value={contact} onChange={setContact}
//     invalid={invalid} describedBy={describedBy} />
export function ContactPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  // The contact that is picked, or null for none.
  value: ContactRef | null;
  onChange: (contact: ContactRef | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <RecordPicker
      kind={CONTACT}
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}

// The Contact filter above a list (ListToolbar's `extra`). `of` is what the list holds, for
// the sentence in the dialog: "Show only the opportunities of one contact."
export function ContactFilter({
  contactId,
  onChange,
  of,
}: {
  // "" when the filter is off.
  contactId: string;
  onChange: (contactId: string) => void;
  of: string;
}) {
  return (
    <RecordFilter
      kind={CONTACT}
      recordId={contactId}
      onChange={onChange}
      description={`Show only the ${of} of one contact.`}
    />
  );
}
