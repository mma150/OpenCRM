import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomField, CustomFieldValues } from "@/features/custom-fields/custom-fields.types";
import { formatDay, formatNumber } from "@/lib/format";

import { DetailItem, DetailList, EmptyValue } from "./record-layout";

// A stored value as people read it: a number with its separators, a day as a date.
export function formatCustomFieldValue(field: CustomField, value: string | number): string {
  if (field.type === "NUMBER" && typeof value === "number") {
    return formatNumber(value);
  }
  if (field.type === "DATE" && typeof value === "string") {
    return formatDay(value);
  }
  return String(value);
}

// The "Custom fields" card in the side column of a record page: every field in use with the
// record's value, or the empty marker. It renders nothing for a record type without custom
// fields. `values` is the record's `customFields`.
export function CustomFieldsCard({
  fields,
  values,
}: {
  fields: CustomField[];
  values: CustomFieldValues;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom fields</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList>
          {fields.map((field) => {
            const value = values[field.id] ?? null;
            return (
              <DetailItem key={field.id} label={field.label}>
                {value === null ? (
                  <EmptyValue />
                ) : (
                  <span className="whitespace-pre-wrap">
                    {formatCustomFieldValue(field, value)}
                  </span>
                )}
              </DetailItem>
            );
          })}
        </DetailList>
      </CardContent>
    </Card>
  );
}
