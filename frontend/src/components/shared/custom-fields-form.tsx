"use client";

import {
  type Control,
  Controller,
  type ControllerRenderProps,
  type FieldValues,
} from "react-hook-form";
import { z } from "zod";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomField, CustomFieldValues } from "@/features/custom-fields/custom-fields.types";

// The custom fields of a record form (leads, contacts, companies, opportunities). A form
// keeps them under one key, `customFields`, as text keyed by the field's id:
//
//   const schema = useMemo(
//     () => leadFormSchema.extend({ customFields: customFieldsSchema(fields, lead?.customFields) }),
//     [fields, lead],
//   );
//   defaultValues: { ..., customFields: customFieldDefaults(fields, lead?.customFields) }
//   <CustomFieldsSection control={control} fields={fields} stored={lead?.customFields} />
//
// and turns them into the API's values with `customFieldsForCreate` or `changedCustomFields`.

// What the form holds: every value as the text of its control, "" for none.
export type CustomFieldFormValues = Record<string, string>;

// The longest text the API stores in a text field.
const MAX_TEXT_LENGTH = 500;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
// The select needs a value for "nothing chosen"; the form sees it as "".
const NONE = "__none__";

function storedValue(stored: CustomFieldValues | undefined, field: CustomField) {
  return stored?.[field.id] ?? null;
}

// The starting values of the form: what the record holds, or "" for every field.
export function customFieldDefaults(
  fields: CustomField[],
  stored?: CustomFieldValues,
): CustomFieldFormValues {
  return Object.fromEntries(
    fields.map((field) => {
      const value = storedValue(stored, field);
      return [field.id, value === null ? "" : String(value)];
    }),
  );
}

// The text of a control as the API takes it: a number for a number field, null for none.
function toApiValue(field: CustomField, text: string | undefined): string | number | null {
  const value = (text ?? "").trim();
  if (value === "") {
    return null;
  }
  return field.type === "NUMBER" ? Number(value) : value;
}

// The same rules as the API, to save a round trip. The server checks again.
//
// A required field must be filled in on a new record. On an existing one it only cannot be
// emptied: a record from before the field existed, or before it became required, stays
// editable, exactly as the API allows.
export function customFieldsSchema(fields: CustomField[], stored?: CustomFieldValues) {
  return z.record(z.string(), z.string()).superRefine((values, context) => {
    for (const field of fields) {
      const value = (values[field.id] ?? "").trim();
      const path = [field.id];
      if (value === "") {
        const hadValue = storedValue(stored, field) !== null;
        if (field.required && (stored === undefined || hadValue)) {
          context.addIssue({
            code: "custom",
            path,
            message: field.type === "DROPDOWN" ? "Choose an option." : "Enter a value.",
          });
        }
      } else if (field.type === "TEXT" && value.length > MAX_TEXT_LENGTH) {
        context.addIssue({
          code: "custom",
          path,
          message: `Use ${String(MAX_TEXT_LENGTH)} characters or fewer.`,
        });
      } else if (field.type === "NUMBER" && !NUMBER_PATTERN.test(value)) {
        context.addIssue({ code: "custom", path, message: "Enter a number such as 12 or 12.5." });
      }
    }
  });
}

// For a new record: the fields that were filled in. Undefined when there are none, so the
// request leaves `customFields` out.
export function customFieldsForCreate(
  fields: CustomField[],
  values: CustomFieldFormValues,
): CustomFieldValues | undefined {
  const filled: CustomFieldValues = {};
  for (const field of fields) {
    const value = toApiValue(field, values[field.id]);
    if (value !== null) {
      filled[field.id] = value;
    }
  }
  return Object.keys(filled).length > 0 ? filled : undefined;
}

// For an edit: only the fields the user actually changed (the API merges key by key), with
// null for one that was emptied. Undefined when nothing changed. A dropdown that still
// holds an option that was removed since is therefore never sent, and so is kept.
export function changedCustomFields(
  fields: CustomField[],
  stored: CustomFieldValues,
  values: CustomFieldFormValues,
): CustomFieldValues | undefined {
  const changes: CustomFieldValues = {};
  for (const field of fields) {
    const value = toApiValue(field, values[field.id]);
    if (value !== storedValue(stored, field)) {
      changes[field.id] = value;
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

// The names the API reports problems on, for `applyServerError`: "customFields.<field id>".
export function customFieldPaths(fields: CustomField[]): `customFields.${string}`[] {
  return fields.map((field) => `customFields.${field.id}` as const);
}

type ControlProps = {
  id: string;
  field: ControllerRenderProps<FieldValues, string>;
  invalid: boolean;
  describedBy: string | undefined;
  required: boolean;
};

function DropdownControl({
  definition,
  storedOption,
  id,
  field,
  invalid,
  describedBy,
  required,
}: ControlProps & {
  definition: CustomField;
  // What the record holds, when it is an option that has been removed since.
  storedOption: string | null;
}) {
  const value = typeof field.value === "string" ? field.value : "";
  return (
    <Select
      value={value === "" ? NONE : value}
      onValueChange={(next) => {
        field.onChange(next === NONE ? "" : next);
      }}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-required={required}
        className="w-full min-w-0 data-[size=default]:h-10"
      >
        <span className="truncate">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {definition.options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
        {/* It can be kept, and gone back to while the form is open, but the API will not
            take it for another record. */}
        {storedOption === null ? null : (
          <SelectItem value={storedOption}>{storedOption} (removed option)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

function FieldControl({ definition, ...props }: ControlProps & { definition: CustomField }) {
  const { id, field, invalid, describedBy, required } = props;
  const shared = {
    ...field,
    value: typeof field.value === "string" ? field.value : "",
    id,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
    "aria-required": required,
    autoComplete: "off",
    className: "h-10",
  };
  switch (definition.type) {
    case "TEXT":
      return <Input {...shared} maxLength={MAX_TEXT_LENGTH} />;
    case "NUMBER":
      // Text, so an empty box means "no value" and nothing is rounded while typing.
      return <Input {...shared} inputMode="decimal" />;
    case "DATE":
      return <Input {...shared} type="date" />;
    case "DROPDOWN":
      return null;
  }
}

// The "Custom fields" part of a record form: one control per field in use, by its type.
// It renders nothing for a record type without custom fields. `stored` is what the record
// being edited holds; leave it out in a form that creates a record.
export function CustomFieldsSection<Values extends FieldValues>({
  control,
  fields,
  stored,
}: {
  control: Control<Values>;
  fields: CustomField[];
  stored?: CustomFieldValues;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-4 border-t pt-4">
      <legend className="float-left text-sm font-semibold">Custom fields</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map((definition) => {
          const name = `customFields.${definition.id}`;
          const errorId = `${name}-error`;
          const value = storedValue(stored, definition);
          const storedOption =
            definition.type === "DROPDOWN" &&
            typeof value === "string" &&
            !definition.options.includes(value)
              ? value
              : null;
          return (
            <Controller
              key={definition.id}
              control={control as unknown as Control}
              name={name}
              render={({ field, fieldState }) => {
                const props: ControlProps = {
                  id: name,
                  field,
                  invalid: fieldState.invalid,
                  describedBy: fieldState.invalid ? errorId : undefined,
                  required: definition.required,
                };
                return (
                  <Field data-invalid={fieldState.invalid} className="min-w-0">
                    <div className="flex min-w-0 items-start gap-1">
                      <FieldLabel htmlFor={name} className="min-w-0 wrap-anywhere">
                        {definition.label}
                      </FieldLabel>
                      {definition.required ? (
                        <span aria-hidden className="text-destructive text-sm leading-snug">
                          *
                        </span>
                      ) : null}
                    </div>
                    {definition.type === "DROPDOWN" ? (
                      <DropdownControl
                        {...props}
                        definition={definition}
                        storedOption={storedOption}
                      />
                    ) : (
                      <FieldControl {...props} definition={definition} />
                    )}
                    {fieldState.invalid ? (
                      <FieldError id={errorId} errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                );
              }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
