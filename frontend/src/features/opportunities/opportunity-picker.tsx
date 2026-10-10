"use client";

import { CircleDollarSign } from "lucide-react";

import {
  type PickedRecord,
  RecordPicker,
  type RecordPickerKind,
} from "@/components/shared/record-picker";

import { getOpportunity, listOpportunities } from "./opportunities.api";

// What the shared record picker needs to know about opportunities: what they are called and
// how to search them (GET /opportunities?search=, by name). Each match shows its company
// under the name.
const OPPORTUNITY: RecordPickerKind = {
  label: "Opportunity",
  noun: "opportunity",
  plural: "opportunities",
  icon: CircleDollarSign,
  search: async (text, pageSize) => {
    const list = await listOpportunities({
      ...(text ? { search: text } : {}),
      sort: "name",
      order: "asc",
      page: 1,
      pageSize,
    });
    return {
      matches: list.opportunities.map(({ id, name, company }) => ({
        id,
        name,
        detail: company?.name,
      })),
      total: list.total,
    };
  },
  find: getOpportunity,
};

// Chooses one opportunity from all the opportunities the user may see, by searching for a
// name. It is the same picker as the company's (see `CompanyPicker`), and is used the same way.
export function OpportunityPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  // The opportunity that is picked, or null for none.
  value: PickedRecord | null;
  onChange: (opportunity: PickedRecord | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <RecordPicker
      kind={OPPORTUNITY}
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
