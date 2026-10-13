"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageLoading, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectAuth } from "@/features/auth/auth.slice";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchOrganization, saveOrganization } from "./organization.slice";
import type { OrganizationSettings, UpdateOrganizationInput } from "./organization.types";
import { useOrganization } from "./use-organization";

// A whole number of days between two limits, typed as text.
function daysSchema(min: number, max: number) {
  const message = `Enter a whole number from ${String(min)} to ${String(max)}.`;
  return z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, message)
    .refine((value) => Number(value) >= min && Number(value) <= max, message);
}

const TAX_RATE_MESSAGE = "Enter a rate from 0 to 100, with at most two decimals.";

// The API's limits, so the user hears about them before the request is sent.
const organizationSchema = z.object({
  name: z.string().trim().max(200, "Use 200 characters or fewer."),
  address: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
  email: z
    .string()
    .trim()
    .max(254, "Use 254 characters or fewer.")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  phone: z.string().trim().max(50, "Use 50 characters or fewer."),
  taxId: z.string().trim().max(100, "Use 100 characters or fewer."),
  defaultQuoteTerms: z.string().trim().max(5000, "Use 5,000 characters or fewer."),
  // Numbers are text in the form and JSON numbers in the request.
  defaultValidityDays: daysSchema(1, 365),
  defaultTaxRate: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, TAX_RATE_MESSAGE)
    .refine((value) => Number(value) <= 100, TAX_RATE_MESSAGE),
  invoicePaymentTermsDays: daysSchema(0, 365),
});

type OrganizationValues = z.infer<typeof organizationSchema>;

const ORGANIZATION_FIELDS = [
  "name",
  "address",
  "email",
  "phone",
  "taxId",
  "defaultQuoteTerms",
  "defaultValidityDays",
  "defaultTaxRate",
  "invoicePaymentTermsDays",
] as const;

function valuesOf(organization: OrganizationSettings): OrganizationValues {
  return {
    name: organization.name,
    address: organization.address ?? "",
    email: organization.email ?? "",
    phone: organization.phone ?? "",
    taxId: organization.taxId ?? "",
    defaultQuoteTerms: organization.defaultQuoteTerms ?? "",
    defaultValidityDays: String(organization.defaultValidityDays),
    defaultTaxRate: String(organization.defaultTaxRate),
    invoicePaymentTermsDays: String(organization.invoicePaymentTermsDays),
  };
}

// PUT replaces the settings, so the whole form is sent every time: an empty text as null
// (which clears it) and every number, so none falls back to its default.
function inputOf(values: OrganizationValues): UpdateOrganizationInput {
  return {
    name: values.name,
    address: values.address || null,
    email: values.email || null,
    phone: values.phone || null,
    taxId: values.taxId || null,
    defaultQuoteTerms: values.defaultQuoteTerms || null,
    defaultValidityDays: Number(values.defaultValidityDays),
    defaultTaxRate: Number(values.defaultTaxRate),
    invoicePaymentTermsDays: Number(values.invoicePaymentTermsDays),
  };
}

const cardClass = "bg-card flex min-w-0 flex-col gap-4 rounded-lg border p-4 sm:p-6";

function OrganizationForm({ organization }: { organization: OrganizationSettings }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<OrganizationValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: valuesOf(organization),
  });
  const { control } = form;

  async function onSubmit(values: OrganizationValues) {
    setFormError(null);
    try {
      const saved = await dispatch(saveOrganization(inputOf(values))).unwrap();
      // The API trims and lowercases: show what was stored.
      form.reset(valuesOf(saved));
      toast.success("The organisation settings were saved.");
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ORGANIZATION_FIELDS));
    }
  }

  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <FormAlert message={formError} />

      <section aria-labelledby="organization-details" className={cardClass}>
        <div className="flex flex-col gap-1">
          <h2 id="organization-details" className="text-base font-medium">
            Details
          </h2>
          <p className="text-muted-foreground text-sm">
            Printed at the top of every quote and invoice.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField control={control} name="name" label="Name">
              {(field) => (
                <Input {...field} autoComplete="organization" maxLength={200} className="h-10" />
              )}
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField control={control} name="address" label="Address">
              {(field) => <Textarea {...field} rows={3} maxLength={1000} />}
            </FormField>
          </div>
          <FormField control={control} name="email" label="Email">
            {(field) => (
              <Input {...field} type="email" autoComplete="off" maxLength={254} className="h-10" />
            )}
          </FormField>
          <FormField control={control} name="phone" label="Phone">
            {(field) => (
              <Input {...field} type="tel" autoComplete="off" maxLength={50} className="h-10" />
            )}
          </FormField>
          <FormField
            control={control}
            name="taxId"
            label="Tax ID"
            description="Your VAT, GST or company registration number."
          >
            {(field) => <Input {...field} autoComplete="off" maxLength={100} className="h-10" />}
          </FormField>
        </div>
      </section>

      <section aria-labelledby="organization-defaults" className={cardClass}>
        <div className="flex flex-col gap-1">
          <h2 id="organization-defaults" className="text-base font-medium">
            Defaults for new quotes and invoices
          </h2>
          <p className="text-muted-foreground text-sm">
            What a new quote or invoice starts with. Changes here never alter quotes and invoices
            that already exist.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField
            control={control}
            name="defaultValidityDays"
            label="Quote validity (days)"
            description="1 to 365. A new quote is valid this long from its issue date."
          >
            {(field) => (
              <Input {...field} inputMode="numeric" autoComplete="off" className="h-10" />
            )}
          </FormField>
          <FormField
            control={control}
            name="defaultTaxRate"
            label="Default tax rate (%)"
            description="0 to 100. For a product without a tax rate of its own."
          >
            {(field) => (
              <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
            )}
          </FormField>
          <FormField
            control={control}
            name="invoicePaymentTermsDays"
            label="Invoice payment terms (days)"
            description="0 to 365. A new invoice is due this long after its issue date."
          >
            {(field) => (
              <Input {...field} inputMode="numeric" autoComplete="off" className="h-10" />
            )}
          </FormField>
          <div className="md:col-span-3">
            <FormField
              control={control}
              name="defaultQuoteTerms"
              label="Default quote terms"
              description="The terms a new quote starts with. They can be changed on each quote."
            >
              {(field) => <Textarea {...field} rows={5} maxLength={5000} />}
            </FormField>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="submit"
          className="h-10 px-4 max-sm:w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function OrganizationAdmin() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useOrganization();

  return (
    <>
      <PageHeader
        title="Organization"
        description="Who your quotes and invoices are from, and what a new one starts with."
      />
      {data ? (
        <OrganizationForm organization={data} />
      ) : status === "failed" && error ? (
        <PageError error={error} onRetry={() => void dispatch(fetchOrganization())} />
      ) : (
        <PageLoading label="Loading organisation settings..." />
      )}
    </>
  );
}

// /settings/organization: an Admin edits the organisation's details and the defaults of a
// new quote. Everyone else gets a page that says so; the API refuses their changes too.
export function OrganizationSettingsPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (me.role !== "ADMIN") {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Organization"
        description="Only an Admin can change the organisation's details."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <OrganizationAdmin />;
}
