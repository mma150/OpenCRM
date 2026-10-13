"use client";

import { CircleDollarSign } from "lucide-react";

import { RecordFilter, type RecordPickerKind } from "@/components/shared/record-picker";
import { getOpportunity, listOpportunities } from "@/features/opportunities/opportunities.api";

// Opportunities as the shared record picker searches them (GET /opportunities?search=, by
// name), with each one's company under its name.
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

// The Opportunity filter above the quotes list (ListToolbar's `extra`). The list shows it
// only when the address sets it, which "View all" on an opportunity's Quotes card does, so
// the filter can be seen and switched off.
export function QuoteOpportunityFilter({
  opportunityId,
  onChange,
}: {
  // "" when the filter is off.
  opportunityId: string;
  onChange: (opportunityId: string) => void;
}) {
  return (
    <RecordFilter
      kind={OPPORTUNITY}
      recordId={opportunityId}
      onChange={onChange}
      description="Show only the quotes of one opportunity."
    />
  );
}
