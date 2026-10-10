"use client";

import type { ReactNode } from "react";
import {
  type Control,
  Controller,
  type ControllerRenderProps,
  type FieldValues,
  type Path,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

// What FormField hands to the control it wraps: the react-hook-form field plus the
// attributes that tie the control to its label, hint and error message. `value` has the
// type of the field that was named, so a form may hold more than text.
export type FormControlProps<
  Values extends FieldValues,
  Name extends Path<Values> = Path<Values>,
> = ControllerRenderProps<Values, Name> & {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

// One form row: label, control, optional hint, and the error (from Zod or from the server).
// Every form in the app uses it, so labels and errors look and read the same everywhere.
export function FormField<Values extends FieldValues, Name extends Path<Values>>({
  control,
  name,
  label,
  description,
  labelAction,
  children,
}: {
  control: Control<Values>;
  name: Name;
  label: string;
  description?: string;
  // Shown at the end of the label row, such as the "Forgot password?" link.
  labelAction?: ReactNode;
  children: (props: FormControlProps<Values, Name>) => ReactNode;
}) {
  const descriptionId = `${name}-description`;
  const errorId = `${name}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [
          fieldState.invalid ? errorId : null,
          description ? descriptionId : null,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor={name}>{label}</FieldLabel>
              {labelAction}
            </div>
            {children({
              ...field,
              id: name,
              "aria-invalid": fieldState.invalid,
              "aria-describedby": describedBy || undefined,
            })}
            {description ? (
              <FieldDescription id={descriptionId}>{description}</FieldDescription>
            ) : null}
            {fieldState.invalid ? <FieldError id={errorId} errors={[fieldState.error]} /> : null}
          </Field>
        );
      }}
    />
  );
}
