"use client";

import type { PickedRecord } from "@/components/shared/record-picker";
import { CompanyPicker } from "@/features/companies/company-picker";
import { ContactPicker } from "@/features/contacts/contact-picker";
import { LeadPicker } from "@/features/leads/lead-picker";
import { OpportunityPicker } from "@/features/opportunities/opportunity-picker";

import type { TaskRecordType } from "./tasks.types";

// Each record type's own picker. All four are the shared RecordPicker with a different
// `RecordPickerKind`; a new record type adds one line (TypeScript asks for it).
const PICKER_OF: Record<TaskRecordType, typeof LeadPicker> = {
  LEAD: LeadPicker,
  CONTACT: ContactPicker,
  COMPANY: CompanyPicker,
  OPPORTUNITY: OpportunityPicker,
};

// Chooses the record a task is linked to, once its type is chosen: the picker of that type.
export function TaskRecordPicker({
  type,
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  type: TaskRecordType;
  id?: string;
  value: PickedRecord | null;
  onChange: (record: PickedRecord | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const Picker = PICKER_OF[type];
  return (
    <Picker id={id} value={value} onChange={onChange} invalid={invalid} describedBy={describedBy} />
  );
}
