"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectControl, type SelectOption } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { createCompany, updateCompany } from "./companies.slice";
import type { Company, CreateCompanyInput, UpdateCompanyInput } from "./companies.types";
import { WEBSITE_PATTERN } from "./company-website";

const tooLong = (max: number) => `Use ${String(max)} characters or fewer.`;
const optionalText = (max: number) => z.string().trim().max(max, tooLong(max));

// The same limits as the API, to save a round trip. The server checks again.
const companyFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200, tooLong(200)),
  // "example.com" or "https://example.com/about"; no other scheme.
  website: optionalText(200).refine(
    (value) => value === "" || WEBSITE_PATTERN.test(value),
    "Enter a web address such as example.com.",
  ),
  industry: optionalText(100),
  phone: optionalText(50),
  address: optionalText(500),
  ownerId: z.string(),
  notes: optionalText(10_000),
});

type CompanyFormValues = z.infer<typeof companyFormSchema>;

// The form fields the API reports validation problems on.
const COMPANY_FORM_FIELDS = [
  "name",
  "website",
  "industry",
  "phone",
  "address",
  "ownerId",
  "notes",
] as const;

// The text fields that may be empty: "" in the form, null in the API.
const OPTIONAL_TEXT_FIELDS = ["website", "industry", "phone", "address", "notes"] as const;

// Empty optional fields are left out, and the owner is sent only when it was offered.
function toCreateInput(values: CompanyFormValues, withOwner: boolean): CreateCompanyInput {
  const input: CreateCompanyInput = { name: values.name };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (values[field]) {
      input[field] = values[field];
    }
  }
  if (withOwner) {
    input.ownerId = values.ownerId;
  }
  return input;
}

// Only what the user actually changed is sent. An emptied field is sent as null, which clears it.
function changedFields(company: Company, values: CompanyFormValues): UpdateCompanyInput {
  const changes: UpdateCompanyInput = {};
  if (values.name !== company.name) {
    changes.name = values.name;
  }
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const next = values[field] || null;
    if (next !== company[field]) {
      changes[field] = next;
    }
  }
  return changes;
}

// The one company form: it creates a company when there is no `company`, and edits `company`
// otherwise. `owners` are the people the user may give a new company to; the Owner field is
// shown only when there is a choice to make. An existing company changes owner with
// Reassign, not here. `industries` are the ones already in use, offered as suggestions so
// the same industry is not written three ways.
export function CompanyForm({
  company,
  myId,
  owners = [],
  industries = [],
  returnTo,
}: {
  company?: Company;
  myId: string;
  owners?: SelectOption[];
  industries?: string[];
  // Where Cancel goes, and where the user lands after saving an edit.
  returnTo: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const showOwner = !company && owners.length > 1;
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: company?.name ?? "",
      website: company?.website ?? "",
      industry: company?.industry ?? "",
      phone: company?.phone ?? "",
      address: company?.address ?? "",
      ownerId: myId,
      notes: company?.notes ?? "",
    },
  });

  async function onSubmit(values: CompanyFormValues) {
    setFormError(null);
    try {
      if (company) {
        const changes = changedFields(company, values);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateCompany({ id: company.id, changes })).unwrap();
          toast.success("Changes saved.");
        }
        router.replace(returnTo);
      } else {
        const created = await dispatch(createCompany(toCreateInput(values, showOwner))).unwrap();
        toast.success("Company created.");
        router.replace(`/companies/${created.id}`);
      }
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, COMPANY_FORM_FIELDS));
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
            <FormField control={control} name="name" label="Company name">
              {(field) => <Input {...field} autoComplete="off" className="h-10" />}
            </FormField>
            <FormField control={control} name="industry" label="Industry">
              {(field) => (
                <>
                  <Input {...field} autoComplete="off" list="company-industries" className="h-10" />
                  <datalist id="company-industries">
                    {industries.map((industry) => (
                      <option key={industry} value={industry} />
                    ))}
                  </datalist>
                </>
              )}
            </FormField>
            <FormField control={control} name="website" label="Website">
              {(field) => (
                <Input
                  {...field}
                  inputMode="url"
                  autoComplete="off"
                  placeholder="example.com"
                  className="h-10"
                />
              )}
            </FormField>
            <FormField control={control} name="phone" label="Phone">
              {(field) => <Input {...field} type="tel" autoComplete="off" className="h-10" />}
            </FormField>
            <div className="md:col-span-2">
              <FormField control={control} name="address" label="Address">
                {(field) => <Textarea {...field} rows={3} className="min-h-20" />}
              </FormField>
            </div>
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
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={returnTo}>Cancel</Link>
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={submitting}>
              {company
                ? submitting
                  ? "Saving..."
                  : "Save changes"
                : submitting
                  ? "Creating..."
                  : "Create company"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
