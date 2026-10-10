"use client";

import type { Control } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { SelectControl, type SelectOption } from "@/components/shared/select-control";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, ROLES } from "@/lib/user-labels";
import { emailSchema, nameSchema } from "@/lib/validation";

import type { User } from "./users.types";

// The select needs a value for "nobody"; it is turned into null before it is sent.
export const NO_MANAGER = "none";

export const userFormSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(ROLES),
  managerId: z.string(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

// The form fields the API reports validation problems on.
export const USER_FORM_FIELDS = ["name", "email", "role", "managerId"] as const;

// Only a Sales Rep has a manager (D-17), so the value is dropped for every other role.
export function managerIdOf(values: UserFormValues): string | null {
  return values.role === "SALES_REP" && values.managerId !== NO_MANAGER ? values.managerId : null;
}

// Who can be picked as a manager: Sales Managers who are not deactivated (an invited manager
// can already be given reps). `current` keeps a rep's existing manager in the list even after
// that manager was deactivated, so the form shows the truth.
export function managerOptions(
  users: User[],
  current?: User["manager"],
): { value: string; label: string }[] {
  const options = users
    .filter((user) => user.role === "SALES_MANAGER" && user.status !== "DEACTIVATED")
    .map((user) => ({ value: user.id, label: user.name }));
  if (current && !options.some((option) => option.value === current.id)) {
    const note = current.status === "DEACTIVATED" ? " (deactivated)" : "";
    options.push({ value: current.id, label: `${current.name}${note}` });
  }
  return options;
}

const roleOptions: SelectOption[] = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

// Name, email, role and manager: the same four fields in the Invite and Edit dialogs.
// Manager is shown only while the role is Sales Rep.
export function UserFormFields({
  control,
  role,
  managers,
}: {
  control: Control<UserFormValues>;
  role: UserFormValues["role"];
  managers: SelectOption[];
}) {
  return (
    <>
      <FormField control={control} name="name" label="Full name">
        {(field) => <Input {...field} autoComplete="off" className="h-10" />}
      </FormField>
      <FormField control={control} name="email" label="Email">
        {(field) => <Input {...field} type="email" autoComplete="off" className="h-10" />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={control} name="role" label="Role">
          {({ id, value, onChange, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
            <SelectControl
              id={id}
              value={value}
              onChange={onChange}
              invalid={invalid}
              describedBy={describedBy}
              options={roleOptions}
            />
          )}
        </FormField>
        {role === "SALES_REP" ? (
          <FormField control={control} name="managerId" label="Manager">
            {({
              id,
              value,
              onChange,
              "aria-invalid": invalid,
              "aria-describedby": describedBy,
            }) => (
              <SelectControl
                id={id}
                value={value}
                onChange={onChange}
                invalid={invalid}
                describedBy={describedBy}
                options={[{ value: NO_MANAGER, label: "No manager" }, ...managers]}
              />
            )}
          </FormField>
        ) : null}
      </div>
    </>
  );
}
