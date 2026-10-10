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
import type { CompanyRef } from "@/features/companies/companies.types";
import { CompanyPicker } from "@/features/companies/company-picker";
import { ContactPicker, type ContactRef } from "@/features/contacts/contact-picker";
import type { CustomField } from "@/features/custom-fields/custom-fields.types";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { createOpportunity, updateOpportunity } from "./opportunities.slice";
import type {
  CreateOpportunityInput,
  Opportunity,
  UpdateOpportunityInput,
} from "./opportunities.types";

const tooLong = (max: number) => `Use ${String(max)} characters or fewer.`;

// The same limits as the API, to save a round trip. The server checks again.
const opportunityFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200, tooLong(200)),
  // Typed as text so an empty box means 0; sent as a number.
  value: z
    .string()
    .trim()
    .regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter an amount such as 48000 or 48000.50."),
  // The value of a date input: "2026-11-15", or "" for none.
  expectedCloseDate: z.string(),
  stageId: z.string(),
  // The ids of the picked company and contact; "" for none.
  companyId: z.string(),
  contactId: z.string(),
  ownerId: z.string(),
  notes: z.string().trim().max(10_000, tooLong(10_000)),
});

// The record's own fields, plus its custom fields as text keyed by the field's id.
type OpportunityFormValues = z.infer<typeof opportunityFormSchema> & {
  customFields: CustomFieldFormValues;
};

const NO_CUSTOM_FIELDS: CustomField[] = [];

// The form fields the API reports validation problems on.
const OPPORTUNITY_FORM_FIELDS = [
  "name",
  "value",
  "expectedCloseDate",
  "stageId",
  "companyId",
  "contactId",
  "ownerId",
  "notes",
] as const;

// Empty optional fields are left out; the stage and the owner are sent only when offered.
function toCreateInput(
  values: OpportunityFormValues,
  withOwner: boolean,
  customFields: CustomField[],
): CreateOpportunityInput {
  const input: CreateOpportunityInput = { name: values.name };
  if (values.value) {
    input.value = Number(values.value);
  }
  if (values.expectedCloseDate) {
    input.expectedCloseDate = values.expectedCloseDate;
  }
  if (values.stageId) {
    input.stageId = values.stageId;
  }
  if (values.companyId) {
    input.companyId = values.companyId;
  }
  if (values.contactId) {
    input.contactId = values.contactId;
  }
  if (values.notes) {
    input.notes = values.notes;
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

// Only what the user actually changed is sent. An emptied field is sent as null, which
// clears it (an emptied value is 0); `companyId: null` and `contactId: null` remove the link.
function changedFields(
  opportunity: Opportunity,
  values: OpportunityFormValues,
  customFields: CustomField[],
): UpdateOpportunityInput {
  const changes: UpdateOpportunityInput = {};
  if (values.name !== opportunity.name) {
    changes.name = values.name;
  }
  if (Number(values.value) !== opportunity.value) {
    changes.value = Number(values.value);
  }
  const expectedCloseDate = values.expectedCloseDate || null;
  if (expectedCloseDate !== opportunity.expectedCloseDate) {
    changes.expectedCloseDate = expectedCloseDate;
  }
  const companyId = values.companyId || null;
  if (companyId !== (opportunity.company?.id ?? null)) {
    changes.companyId = companyId;
  }
  const contactId = values.contactId || null;
  if (contactId !== (opportunity.contact?.id ?? null)) {
    changes.contactId = contactId;
  }
  const notes = values.notes || null;
  if (notes !== opportunity.notes) {
    changes.notes = notes;
  }
  const custom = changedCustomFields(customFields, opportunity.customFields, values.customFields);
  if (custom) {
    changes.customFields = custom;
  }
  return changes;
}

// The one opportunity form: it creates an opportunity when there is no `opportunity`, and
// edits `opportunity` otherwise.
//
// A new opportunity also chooses its stage (`stages`, the open ones) and, when there is a
// choice to make, its owner (`owners`). An existing one changes stage on its own page or on
// the board, and owner with Reassign, so neither field is shown. `company` and `contact`
// start a new opportunity linked to them ("Add opportunity" on their pages).
export function OpportunityForm({
  opportunity,
  company,
  contact,
  myId,
  customFields = NO_CUSTOM_FIELDS,
  stages = [],
  owners = [],
  returnTo,
}: {
  opportunity?: Opportunity;
  company?: CompanyRef;
  contact?: ContactRef;
  myId: string;
  // The custom fields in use of this record type; the page loads them.
  customFields?: CustomField[];
  stages?: SelectOption[];
  owners?: SelectOption[];
  // Where Cancel goes, and where the user lands after saving an edit.
  returnTo: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  // The form keeps the ids; the names, for the pickers, are kept here beside them.
  const [pickedCompany, setPickedCompany] = useState<CompanyRef | null>(
    opportunity?.company ?? company ?? null,
  );
  const [pickedContact, setPickedContact] = useState<ContactRef | null>(
    opportunity?.contact ?? contact ?? null,
  );
  const showStage = !opportunity && stages.length > 0;
  const showOwner = !opportunity && owners.length > 1;
  const schema = useMemo(
    () =>
      opportunityFormSchema.extend({
        customFields: customFieldsSchema(customFields, opportunity?.customFields),
      }),
    [customFields, opportunity],
  );
  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: opportunity?.name ?? "",
      value: opportunity ? String(opportunity.value) : "",
      expectedCloseDate: opportunity?.expectedCloseDate ?? "",
      stageId: stages[0]?.value ?? "",
      companyId: pickedCompany?.id ?? "",
      contactId: pickedContact?.id ?? "",
      ownerId: myId,
      notes: opportunity?.notes ?? "",
      customFields: customFieldDefaults(customFields, opportunity?.customFields),
    },
  });

  async function onSubmit(values: OpportunityFormValues) {
    setFormError(null);
    try {
      if (opportunity) {
        const changes = changedFields(opportunity, values, customFields);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateOpportunity({ id: opportunity.id, changes })).unwrap();
          toast.success("Changes saved.");
        }
        router.replace(returnTo);
      } else {
        const created = await dispatch(
          createOpportunity(toCreateInput(values, showOwner, customFields)),
        ).unwrap();
        toast.success("Opportunity created.");
        router.replace(`/opportunities/${created.id}`);
      }
    } catch (error) {
      setFormError(
        applyServerError(error as ApiError, form.setError, [
          ...OPPORTUNITY_FORM_FIELDS,
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
            <div className="md:col-span-2">
              <FormField control={control} name="name" label="Name">
                {(field) => <Input {...field} autoComplete="off" className="h-10" />}
              </FormField>
            </div>
            <FormField control={control} name="value" label="Value (USD)">
              {(field) => (
                <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
              )}
            </FormField>
            <FormField control={control} name="expectedCloseDate" label="Expected close date">
              {(field) => <Input {...field} type="date" className="h-10" />}
            </FormField>
            <FormField control={control} name="companyId" label="Company">
              {({ id, onChange, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <CompanyPicker
                  id={id}
                  value={pickedCompany}
                  onChange={(next) => {
                    setPickedCompany(next);
                    onChange(next?.id ?? "");
                  }}
                  invalid={invalid}
                  describedBy={describedBy}
                />
              )}
            </FormField>
            <FormField control={control} name="contactId" label="Contact">
              {({ id, onChange, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <ContactPicker
                  id={id}
                  value={pickedContact}
                  onChange={(next) => {
                    setPickedContact(next);
                    onChange(next?.id ?? "");
                  }}
                  invalid={invalid}
                  describedBy={describedBy}
                />
              )}
            </FormField>
            {showStage ? (
              <FormField control={control} name="stageId" label="Stage">
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
                    options={stages}
                  />
                )}
              </FormField>
            ) : null}
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
            stored={opportunity?.customFields}
          />
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={returnTo}>Cancel</Link>
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={submitting}>
              {opportunity
                ? submitting
                  ? "Saving..."
                  : "Save changes"
                : submitting
                  ? "Creating..."
                  : "Create opportunity"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
