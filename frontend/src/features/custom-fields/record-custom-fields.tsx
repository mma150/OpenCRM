"use client";

import { CustomFieldsCard } from "@/components/shared/custom-fields-card";

import type { CustomFieldRecordType, CustomFieldValues } from "./custom-fields.types";
import { useCustomFields } from "./use-custom-fields";

// The Custom fields card of a record page: it loads the fields in use of the record type
// and shows the record's value for each. Nothing is drawn until they are known, or when the
// record type has none.
//
//   <RecordCustomFields recordType="LEAD" values={lead.customFields} />
export function RecordCustomFields({
  recordType,
  values,
}: {
  recordType: CustomFieldRecordType;
  values: CustomFieldValues;
}) {
  const { data } = useCustomFields(recordType);
  return <CustomFieldsCard fields={data ?? []} values={values} />;
}
