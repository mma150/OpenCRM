import type { CustomField, CustomFieldRecordType, CustomFieldType } from "./custom-fields.types";

function field(
  position: number,
  label: string,
  type: CustomFieldType,
  extra: Partial<CustomField> = {},
  recordType: CustomFieldRecordType = "LEAD",
): CustomField {
  return {
    id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${String(position)}`,
    recordType,
    label,
    type,
    options: [],
    required: false,
    position,
    archived: false,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...extra,
  };
}

// One field of each type on leads, in order, and an archived one after them.
export const regionField = field(0, "Region", "DROPDOWN", {
  options: ["North", "South", "East"],
  required: true,
});
export const teamSizeField = field(1, "Team size", "NUMBER");
export const renewalField = field(2, "Renewal date", "DATE");
export const channelField = field(3, "Preferred channel", "TEXT");
export const legacyField = field(4, "Legacy code", "TEXT", { archived: true });

export const leadFields: CustomField[] = [regionField, teamSizeField, renewalField, channelField];
export const leadFieldsWithArchived: CustomField[] = [...leadFields, legacyField];

// A field of another record type.
export const tierField = field(5, "Customer tier", "DROPDOWN", { options: ["Gold"] }, "COMPANY");
