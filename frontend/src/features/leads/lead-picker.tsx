"use client";

import { Funnel } from "lucide-react";

import {
  type PickedRecord,
  RecordPicker,
  type RecordPickerKind,
} from "@/components/shared/record-picker";

import { getLead, listLeads } from "./leads.api";

// What the shared record picker needs to know about leads: what they are called and how to
// search them (GET /leads?search=, by name). Each match shows the lead's company under the
// name, because two people can share one.
const LEAD: RecordPickerKind = {
  label: "Lead",
  noun: "lead",
  plural: "leads",
  icon: Funnel,
  search: async (text, pageSize) => {
    const list = await listLeads({
      ...(text ? { search: text } : {}),
      sort: "name",
      order: "asc",
      page: 1,
      pageSize,
    });
    return {
      matches: list.leads.map(({ id, name, company }) => ({ id, name, detail: company })),
      total: list.total,
    };
  },
  find: getLead,
};

// Chooses one lead from all the leads the user may see, by searching for a name. It is the
// same picker as the company's (see `CompanyPicker`), and is used the same way.
export function LeadPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  // The lead that is picked, or null for none.
  value: PickedRecord | null;
  onChange: (lead: PickedRecord | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <RecordPicker
      kind={LEAD}
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
