import type { SelectOption } from "@/components/shared/select-control";

import type { CustomFieldRecordType, CustomFieldType } from "./custom-fields.types";

// The record types that can have custom fields, in the order of the settings page's tabs.
export const CUSTOM_FIELD_RECORD_TYPES = ["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"] as const;

// "Leads" on a tab, "leads" in a sentence, "lead" for one record.
export const RECORD_TYPE_WORDS: Record<
  CustomFieldRecordType,
  { label: string; plural: string; singular: string }
> = {
  LEAD: { label: "Leads", plural: "leads", singular: "lead" },
  CONTACT: { label: "Contacts", plural: "contacts", singular: "contact" },
  COMPANY: { label: "Companies", plural: "companies", singular: "company" },
  OPPORTUNITY: { label: "Opportunities", plural: "opportunities", singular: "opportunity" },
};

export const recordTypeOptions = CUSTOM_FIELD_RECORD_TYPES.map((value) => ({
  value,
  label: RECORD_TYPE_WORDS[value].label,
}));

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN"] as const;

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  DROPDOWN: "Dropdown",
};

export const customFieldTypeOptions: SelectOption[] = CUSTOM_FIELD_TYPES.map((value) => ({
  value,
  label: CUSTOM_FIELD_TYPE_LABELS[value],
}));

// The API's limits, repeated here so the page can say them before the API refuses.
export const MAX_ACTIVE_CUSTOM_FIELDS = 30;
export const MAX_DROPDOWN_OPTIONS = 50;
export const MAX_LABEL_LENGTH = 60;
export const MAX_OPTION_LENGTH = 100;
