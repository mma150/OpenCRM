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
import type { CustomField } from "@/features/custom-fields/custom-fields.types";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { createContact, updateContact } from "./contacts.slice";
import type { Contact, CreateContactInput, UpdateContactInput } from "./contacts.types";

const tooLong = (max: number) => `Use ${String(max)} characters or fewer.`;
const optionalText = (max: number) => z.string().trim().max(max, tooLong(max));

// The same limits as the API, to save a round trip. The server checks again.
const contactFormSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(100, tooLong(100)),
  lastName: z.string().trim().min(1, "Enter a last name.").max(100, tooLong(100)),
  jobTitle: optionalText(100),
  email: optionalText(254).refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address.",
  ),
  phone: optionalText(50),
  // The id of the picked company; "" for none.
  companyId: z.string(),
  ownerId: z.string(),
  notes: optionalText(10_000),
});

// The record's own fields, plus its custom fields as text keyed by the field's id.
type ContactFormValues = z.infer<typeof contactFormSchema> & {
  customFields: CustomFieldFormValues;
};

const NO_CUSTOM_FIELDS: CustomField[] = [];

// The form fields the API reports validation problems on.
const CONTACT_FORM_FIELDS = [
  "firstName",
  "lastName",
  "jobTitle",
  "email",
  "phone",
  "companyId",
  "ownerId",
  "notes",
] as const;

// The text fields that may be empty: "" in the form, null in the API.
const OPTIONAL_TEXT_FIELDS = ["jobTitle", "email", "phone", "notes"] as const;

// Empty optional fields are left out, and the owner is sent only when it was offered.
function toCreateInput(
  values: ContactFormValues,
  withOwner: boolean,
  customFields: CustomField[],
): CreateContactInput {
  const input: CreateContactInput = { firstName: values.firstName, lastName: values.lastName };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (values[field]) {
      input[field] = values[field];
    }
  }
  if (values.companyId) {
    input.companyId = values.companyId;
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
// clears it; `companyId: null` takes the contact out of its company.
function changedFields(
  contact: Contact,
  values: ContactFormValues,
  customFields: CustomField[],
): UpdateContactInput {
  const changes: UpdateContactInput = {};
  if (values.firstName !== contact.firstName) {
    changes.firstName = values.firstName;
  }
  if (values.lastName !== contact.lastName) {
    changes.lastName = values.lastName;
  }
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const next = values[field] || null;
    if (next !== contact[field]) {
      changes[field] = next;
    }
  }
  const companyId = values.companyId || null;
  if (companyId !== (contact.company?.id ?? null)) {
    changes.companyId = companyId;
  }
  const custom = changedCustomFields(customFields, contact.customFields, values.customFields);
  if (custom) {
    changes.customFields = custom;
  }
  return changes;
}

// The one contact form: it creates a contact when there is no `contact`, and edits `contact`
// otherwise. `owners` are the people the user may give a new contact to; the Owner field is
// shown only when there is a choice to make. An existing contact changes owner with
// Reassign, not here. `company` starts a new contact in that company (the "Add contact"
// button on a company's page).
export function ContactForm({
  contact,
  company,
  myId,
  customFields = NO_CUSTOM_FIELDS,
  owners = [],
  returnTo,
}: {
  contact?: Contact;
  company?: CompanyRef;
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
  // The form keeps the company's id; its name, for the picker, is kept here beside it.
  const [picked, setPicked] = useState<CompanyRef | null>(contact?.company ?? company ?? null);
  const showOwner = !contact && owners.length > 1;
  const schema = useMemo(
    () =>
      contactFormSchema.extend({
        customFields: customFieldsSchema(customFields, contact?.customFields),
      }),
    [customFields, contact],
  );
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      jobTitle: contact?.jobTitle ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      companyId: picked?.id ?? "",
      ownerId: myId,
      notes: contact?.notes ?? "",
      customFields: customFieldDefaults(customFields, contact?.customFields),
    },
  });

  async function onSubmit(values: ContactFormValues) {
    setFormError(null);
    try {
      if (contact) {
        const changes = changedFields(contact, values, customFields);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateContact({ id: contact.id, changes })).unwrap();
          toast.success("Changes saved.");
        }
        router.replace(returnTo);
      } else {
        const created = await dispatch(
          createContact(toCreateInput(values, showOwner, customFields)),
        ).unwrap();
        toast.success("Contact created.");
        router.replace(`/contacts/${created.id}`);
      }
    } catch (error) {
      setFormError(
        applyServerError(error as ApiError, form.setError, [
          ...CONTACT_FORM_FIELDS,
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
            <FormField control={control} name="jobTitle" label="Job title">
              {(field) => <Input {...field} autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="companyId" label="Company">
              {({ id, onChange, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <CompanyPicker
                  id={id}
                  value={picked}
                  onChange={(next) => {
                    setPicked(next);
                    onChange(next?.id ?? "");
                  }}
                  invalid={invalid}
                  describedBy={describedBy}
                />
              )}
            </FormField>
            <FormField control={control} name="email" label="Email">
              {(field) => <Input {...field} type="email" autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="phone" label="Phone">
              {(field) => <Input {...field} type="tel" autoComplete="off" className="h-10" />}
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
            stored={contact?.customFields}
          />
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={returnTo}>Cancel</Link>
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={submitting}>
              {contact
                ? submitting
                  ? "Saving..."
                  : "Save changes"
                : submitting
                  ? "Creating..."
                  : "Create contact"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
