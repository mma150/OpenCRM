"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  changedCustomFields,
  customFieldDefaults,
  type CustomFieldFormValues,
  customFieldPaths,
  customFieldsForCreate,
  customFieldsSchema,
  CustomFieldsSection,
} from "@/components/shared/custom-fields-form";
import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectControl, type SelectOption } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomField } from "@/features/custom-fields/custom-fields.types";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { LEAD_SOURCES, leadSourceOptions } from "./lead-labels";
import { createLead, updateLead } from "./leads.slice";
import type { CreateLeadInput, Lead, UpdateLeadInput } from "./leads.types";

const tooLong = (max: number) => `Use ${String(max)} characters or fewer.`;
const optionalText = (max: number) => z.string().trim().max(max, tooLong(max));

// The same limits as the API, to save a round trip. The server checks again.
const leadFormSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(100, tooLong(100)),
  lastName: z.string().trim().min(1, "Enter a last name.").max(100, tooLong(100)),
  company: optionalText(200),
  jobTitle: optionalText(100),
  email: optionalText(254).refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address.",
  ),
  phone: optionalText(50),
  source: z.enum(LEAD_SOURCES),
  // Typed as text so an empty box means "no value"; sent as a number.
  estimatedValue: z
    .string()
    .trim()
    .regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter an amount such as 48000 or 48000.50."),
  ownerId: z.string(),
  notes: optionalText(10_000),
});

// The record's own fields, plus its custom fields as text keyed by the field's id.
type LeadFormValues = z.infer<typeof leadFormSchema> & { customFields: CustomFieldFormValues };

const NO_CUSTOM_FIELDS: CustomField[] = [];

// The form fields the API reports validation problems on.
const LEAD_FORM_FIELDS = [
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "email",
  "phone",
  "source",
  "estimatedValue",
  "ownerId",
  "notes",
] as const;

// The text fields that may be empty: "" in the form, null in the API.
const OPTIONAL_TEXT_FIELDS = ["company", "jobTitle", "email", "phone", "notes"] as const;

function amountOf(values: LeadFormValues): number | null {
  return values.estimatedValue === "" ? null : Number(values.estimatedValue);
}

// Empty optional fields are left out, and the owner is sent only when it was offered.
function toCreateInput(
  values: LeadFormValues,
  withOwner: boolean,
  customFields: CustomField[],
): CreateLeadInput {
  const input: CreateLeadInput = {
    firstName: values.firstName,
    lastName: values.lastName,
    source: values.source,
  };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (values[field]) {
      input[field] = values[field];
    }
  }
  const amount = amountOf(values);
  if (amount !== null) {
    input.estimatedValue = amount;
  }
  const custom = customFieldsForCreate(customFields, values.customFields);
  if (custom) {
    input.customFields = custom;
  }
  if (withOwner) {
    input.ownerId = values.ownerId;
  }
  return input;
}

// Only what the user actually changed is sent. An emptied field is sent as null, which clears it.
function changedFields(
  lead: Lead,
  values: LeadFormValues,
  customFields: CustomField[],
): UpdateLeadInput {
  const changes: UpdateLeadInput = {};
  if (values.firstName !== lead.firstName) {
    changes.firstName = values.firstName;
  }
  if (values.lastName !== lead.lastName) {
    changes.lastName = values.lastName;
  }
  if (values.source !== lead.source) {
    changes.source = values.source;
  }
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const next = values[field] || null;
    if (next !== lead[field]) {
      changes[field] = next;
    }
  }
  if (amountOf(values) !== lead.estimatedValue) {
    changes.estimatedValue = amountOf(values);
  }
  const custom = changedCustomFields(customFields, lead.customFields, values.customFields);
  if (custom) {
    changes.customFields = custom;
  }
  return changes;
}

// The one lead form: it creates a lead when there is no `lead`, and edits `lead` otherwise.
// `owners` are the people the user may give a new lead to; the Owner field is shown only
// when there is a choice to make (otherwise the lead is the user's own). An existing lead
// changes owner with Reassign, not here.
export function LeadForm({
  lead,
  myId,
  customFields = NO_CUSTOM_FIELDS,
  owners = [],
  returnTo,
}: {
  lead?: Lead;
  myId: string;
  // The custom fields in use of this record type; the page loads them.
  customFields?: CustomField[];
  owners?: SelectOption[];
  // Where Cancel goes, and where the user lands after saving an edit.
  returnTo: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const showOwner = !lead && owners.length > 1;
  const schema = useMemo(
    () =>
      leadFormSchema.extend({
        customFields: customFieldsSchema(customFields, lead?.customFields),
      }),
    [customFields, lead],
  );
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: lead?.firstName ?? "",
      lastName: lead?.lastName ?? "",
      company: lead?.company ?? "",
      jobTitle: lead?.jobTitle ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      source: lead?.source ?? "WEBSITE",
      estimatedValue: lead?.estimatedValue == null ? "" : String(lead.estimatedValue),
      ownerId: myId,
      notes: lead?.notes ?? "",
      customFields: customFieldDefaults(customFields, lead?.customFields),
    },
  });

  async function onSubmit(values: LeadFormValues) {
    setFormError(null);
    try {
      if (lead) {
        const changes = changedFields(lead, values, customFields);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateLead({ id: lead.id, changes })).unwrap();
          toast.success("Changes saved.");
        }
        router.replace(returnTo);
      } else {
        const created = await dispatch(
          createLead(toCreateInput(values, showOwner, customFields)),
        ).unwrap();
        toast.success("Lead created.");
        router.replace(`/leads/${created.id}`);
      }
    } catch (error) {
      setFormError(
        applyServerError(error as ApiError, form.setError, [
          ...LEAD_FORM_FIELDS,
          ...customFieldPaths(customFields),
        ]),
      );
    }
  }

  const { control } = form;
  const submitting = form.formState.isSubmitting;

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormAlert message={formError} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField control={control} name="firstName" label="First name">
              {(field) => <Input {...field} autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="lastName" label="Last name">
              {(field) => <Input {...field} autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="company" label="Company">
              {(field) => <Input {...field} autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="jobTitle" label="Job title">
              {(field) => <Input {...field} autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="email" label="Email">
              {(field) => <Input {...field} type="email" autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="phone" label="Phone">
              {(field) => <Input {...field} type="tel" autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="source" label="Source">
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
                  options={leadSourceOptions}
                />
              )}
            </FormField>
            <FormField control={control} name="estimatedValue" label="Estimated value (USD)">
              {(field) => (
                <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
              )}
            </FormField>
            {showOwner ? (
              <FormField control={control} name="ownerId" label="Owner">
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
                    options={owners}
                  />
                )}
              </FormField>
            ) : null}
            <div className="md:col-span-2">
              <FormField control={control} name="notes" label="Notes">
                {(field) => <Textarea {...field} rows={5} className="min-h-32" />}
              </FormField>
            </div>
          </div>
          <CustomFieldsSection
            control={control}
            fields={customFields}
            stored={lead?.customFields}
          />
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={returnTo}>Cancel</Link>
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={submitting}>
              {lead
                ? submitting
                  ? "Saving..."
                  : "Save changes"
                : submitting
                  ? "Creating..."
                  : "Create lead"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
