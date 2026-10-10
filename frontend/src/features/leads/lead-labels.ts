import type { SelectOption } from "@/components/shared/select-control";
import { recordAccess } from "@/lib/record-access";

import type { LeadSource, LeadStatus, LostReason, OpenLeadStatus } from "./leads.types";

// The words shown for a lead's status, source and lost reason, everywhere in the app.
// Never print the raw enum value.
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  COLD_CALL: "Cold call",
  EVENT: "Event",
  OTHER: "Other",
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRICE: "Price",
  CHOSE_COMPETITOR: "Chose competitor",
  NO_BUDGET: "No budget",
  NO_RESPONSE: "No response",
  OTHER: "Other",
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];
export const LEAD_SOURCES = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
export const LOST_REASONS = Object.keys(LOST_REASON_LABELS) as LostReason[];
// The statuses a user sets by hand; Lost and Converted are reached by their own actions.
export const OPEN_LEAD_STATUSES: OpenLeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED"];

function toOptions<Value extends string>(labels: Record<Value, string>): SelectOption[] {
  return (Object.keys(labels) as Value[]).map((value) => ({ value, label: labels[value] }));
}

export const leadStatusOptions = toOptions(LEAD_STATUS_LABELS);
export const leadSourceOptions = toOptions(LEAD_SOURCE_LABELS);
export const lostReasonOptions = toOptions(LOST_REASON_LABELS);
export const openLeadStatusOptions = leadStatusOptions.filter((option) =>
  (OPEN_LEAD_STATUSES as string[]).includes(option.value),
);

export function isOpenLeadStatus(status: LeadStatus): status is OpenLeadStatus {
  return (OPEN_LEAD_STATUSES as LeadStatus[]).includes(status);
}

// What a role may do with the leads it can see: the rule every owned record shares.
export const leadAccess = recordAccess;

// A converted lead lives on as a contact: its details and status are final. It can still be
// reassigned and still takes conversations and notes.
export function isConverted(lead: { status: LeadStatus }): boolean {
  return lead.status === "CONVERTED";
}
