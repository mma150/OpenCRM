"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { discountLabel, DocumentTotals } from "@/components/shared/sales-document";
import { SelectControl } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyRef } from "@/features/companies/companies.types";
import { CompanyPicker } from "@/features/companies/company-picker";
import { ContactPicker, type ContactRef } from "@/features/contacts/contact-picker";
import type { OrganizationSettings } from "@/features/organization/organization.types";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { toDateInputValue } from "@/lib/format";
import { useAppDispatch } from "@/store/hooks";

import {
  changedFields,
  emptyLine,
  forFormFields,
  quoteFormFields,
  quoteFormSchema,
  type QuoteFormValues,
  toCreateInput,
  toFormLine,
} from "./quote-form-values";
import { quoteDiscountOptions } from "./quote-labels";
import { QuoteLineItems } from "./quote-line-items";
import { computeTotals } from "./quote-totals";
import { createQuote, updateQuote } from "./quotes.slice";
import type { Quote } from "./quotes.types";

// What a new quote starts with when the organisation settings could not be loaded: the
// API's own defaults.
const FALLBACK_VALIDITY_DAYS = 30;

// Today plus `days`, as the value of a date input, on the viewer's calendar.
function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

// The one quote form: it makes a quote for `opportunity` when there is no `quote`, and edits
// the draft `quote` otherwise.
//
// The totals box is a live preview counted in the browser (`computeTotals`, the API's own
// rule); once saved, the quote's page shows the numbers the API counted.
export function QuoteForm({
  quote,
  opportunity,
  contact,
  company,
  organization,
  returnTo,
}: {
  quote?: Quote;
  // The opportunity the quote belongs to. It cannot be changed afterwards.
  opportunity: { id: string; name: string };
  // Who a new quote is for to start with: the opportunity's contact and company.
  contact?: ContactRef | null;
  company?: CompanyRef | null;
  // The defaults of a new quote and of a new line; null when they could not be loaded.
  organization: OrganizationSettings | null;
  // Where Cancel goes.
  returnTo: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  // True once the API said the quote is no longer a draft: the form then offers the way back.
  const [notEditable, setNotEditable] = useState(false);
  // The form keeps the ids; the names, for the pickers, are kept here beside them.
  const [pickedContact, setPickedContact] = useState<ContactRef | null>(
    quote ? quote.contact && { id: quote.contact.id, name: quote.contact.name } : (contact ?? null),
  );
  const [pickedCompany, setPickedCompany] = useState<CompanyRef | null>(
    quote ? quote.company : (company ?? null),
  );
  const defaultTaxRate = organization?.defaultTaxRate ?? 0;
  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      contactId: pickedContact?.id ?? "",
      companyId: pickedCompany?.id ?? "",
      issueDate: quote?.issueDate ?? dayFromToday(0),
      validUntil: quote
        ? (quote.validUntil ?? "")
        : dayFromToday(organization?.defaultValidityDays ?? FALLBACK_VALIDITY_DAYS),
      lines: quote ? quote.lines.map((line) => toFormLine(line)) : [emptyLine(defaultTaxRate)],
      discountType: quote?.discountType ?? "NONE",
      discountValue: quote && quote.discountType !== "NONE" ? String(quote.discountValue) : "",
      notes: quote?.notes ?? "",
      terms: quote ? (quote.terms ?? "") : (organization?.defaultQuoteTerms ?? ""),
    },
  });
  const { control } = form;
  const [lines, discountType, discountValue] = useWatch({
    control,
    name: ["lines", "discountType", "discountValue"],
  });
  const totals = computeTotals(lines, discountType, discountValue);

  async function onSubmit(values: QuoteFormValues) {
    setFormError(null);
    setNotEditable(false);
    try {
      if (quote) {
        const changes = changedFields(quote, values);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateQuote({ id: quote.id, changes })).unwrap();
          toast.success("Changes saved.");
        }
        router.replace(`/quotes/${quote.id}`);
      } else {
        const created = await dispatch(createQuote(toCreateInput(opportunity.id, values))).unwrap();
        toast.success(`Quote ${created.number} created.`);
        router.replace(`/quotes/${created.id}`);
      }
    } catch (caught) {
      const error = caught as ApiError;
      setNotEditable(error.code === "QUOTE_NOT_EDITABLE");
      // The API names a line's field by its place: `lines.<index>.<field>`.
      setFormError(
        applyServerError(forFormFields(error), form.setError, quoteFormFields(values.lines.length)),
      );
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-6"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      {formError ? (
        <div className="flex flex-col items-start gap-2">
          <FormAlert message={formError} />
          {notEditable && quote ? (
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={`/quotes/${quote.id}`}>Back to the quote</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Customer and dates</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm wrap-anywhere">
            For the opportunity{" "}
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="text-primary rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {opportunity.name}
            </Link>
            . The contact and the company are printed on the quote.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <FormField control={control} name="issueDate" label="Issue date">
              {(field) => <Input {...field} type="date" className="h-10" />}
            </FormField>
            <FormField
              control={control}
              name="validUntil"
              label="Valid until"
              description="A sent quote reads as expired after this day. Leave empty for no end."
            >
              {(field) => <Input {...field} type="date" className="h-10" />}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Line items</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QuoteLineItems
            control={control}
            setValue={form.setValue}
            lineTotals={totals.lineTotals}
            defaultTaxRate={defaultTaxRate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Discount and totals</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
            <FormField control={control} name="discountType" label="Quote discount">
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
                  options={quoteDiscountOptions}
                />
              )}
            </FormField>
            {discountType === "NONE" ? null : (
              <FormField
                control={control}
                name="discountValue"
                label={discountType === "PERCENT" ? "Discount (%)" : "Discount amount (USD)"}
              >
                {(field) => (
                  <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
                )}
              </FormField>
            )}
            <p className="text-muted-foreground text-xs sm:col-span-2">
              The quote discount comes off the subtotal, before tax. A line can have a discount of
              its own as well.
            </p>
          </div>
          <section aria-label="Totals" className="min-w-0">
            <DocumentTotals
              subtotal={totals.subtotal}
              discountTotal={totals.discountTotal}
              discountLabel={discountLabel(
                discountType,
                discountType === "PERCENT" ? Number(discountValue) || 0 : null,
              )}
              taxes={totals.taxes}
              taxTotal={totals.taxTotal}
              total={totals.total}
              note="A live preview. Once saved, the quote shows the totals the server counted."
            />
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Notes and terms</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={control}
            name="notes"
            label="Notes"
            description="Printed on the quote, above the terms."
          >
            {(field) => <Textarea {...field} rows={5} className="min-h-32" />}
          </FormField>
          <FormField
            control={control}
            name="terms"
            label="Terms"
            description="Payment and delivery terms. A new quote starts with the organisation's default terms."
          >
            {(field) => <Textarea {...field} rows={5} className="min-h-32" />}
          </FormField>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href={returnTo}>Cancel</Link>
        </Button>
        <Button type="submit" className="h-10 px-4" disabled={submitting}>
          {quote
            ? submitting
              ? "Saving..."
              : "Save changes"
            : submitting
              ? "Creating..."
              : "Create quote"}
        </Button>
      </div>
    </form>
  );
}
