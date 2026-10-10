"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { SelectControl } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CompanyRef } from "@/features/companies/companies.types";
import { CompanyPicker } from "@/features/companies/company-picker";
import { ContactPicker, type ContactRef } from "@/features/contacts/contact-picker";
import { openStages, stageOptions } from "@/features/pipeline-stages/stage-labels";
import { usePipelineStages } from "@/features/pipeline-stages/use-pipeline-stages";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { convertLead } from "./leads.slice";
import type { ConvertLeadInput, Lead } from "./leads.types";

const tooLong = (max: number) => `Use ${String(max)} characters or fewer.`;

// The same limits as the API, to save a round trip. Which fields are needed depends on the
// choices made, so that is checked in `missingFields` below, not here.
const convertSchema = z.object({
  companyMode: z.enum(["create", "existing", "none"]),
  companyName: z.string().trim().max(200, tooLong(200)),
  companyId: z.string(),
  contactMode: z.enum(["create", "existing"]),
  contactId: z.string(),
  opportunityName: z.string().trim().max(200, tooLong(200)),
  // Typed as text so an empty box means "use the lead's estimated value".
  opportunityValue: z
    .string()
    .trim()
    .regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter an amount such as 48000 or 48000.50."),
  expectedCloseDate: z.string(),
  stageId: z.string(),
});

type ConvertValues = z.infer<typeof convertSchema>;
type ConvertField = keyof ConvertValues;

// The API names a field by its place in the request ("company.name"); this is the form
// field that holds it.
const FIELD_OF_PATH: Record<string, ConvertField> = {
  "company.name": "companyName",
  "company.id": "companyId",
  "contact.id": "contactId",
  "opportunity.name": "opportunityName",
  "opportunity.value": "opportunityValue",
  "opportunity.expectedCloseDate": "expectedCloseDate",
  "opportunity.stageId": "stageId",
};
const CONVERT_FIELDS = Object.values(FIELD_OF_PATH);

// The same error with its field paths renamed to the form's fields, for `applyServerError`.
function withFormFields(error: ApiError): ApiError {
  if (!Array.isArray(error.details)) {
    return error;
  }
  const details = (error.details as unknown[]).map((detail) => {
    const path =
      typeof detail === "object" && detail !== null && "path" in detail ? detail.path : null;
    const field = typeof path === "string" ? FIELD_OF_PATH[path] : undefined;
    return field ? { ...(detail as object), path: field } : detail;
  });
  return { ...error, details };
}

// The fields the chosen modes need and that are still empty, each with what to say.
function missingFields(values: ConvertValues, withOpportunity: boolean): [ConvertField, string][] {
  const missing: [ConvertField, string][] = [];
  if (values.companyMode === "create" && values.companyName === "") {
    missing.push(["companyName", "Enter the company's name."]);
  }
  if (values.companyMode === "existing" && values.companyId === "") {
    missing.push(["companyId", "Choose a company."]);
  }
  if (values.contactMode === "existing" && values.contactId === "") {
    missing.push(["contactId", "Choose a contact."]);
  }
  if (withOpportunity && values.opportunityName === "") {
    missing.push(["opportunityName", "Enter a name."]);
  }
  return missing;
}

// Short words, so three choices fit a phone. The section's heading says what they are about.
const companyModes = [
  { value: "create", label: "Create new" },
  { value: "existing", label: "Use existing" },
  { value: "none", label: "None" },
] as const;

const contactModes = [
  { value: "create", label: "Create new" },
  { value: "existing", label: "Use existing" },
] as const;

function toInput(values: ConvertValues, withOpportunity: boolean): ConvertLeadInput {
  return {
    company:
      values.companyMode === "create"
        ? { mode: "create", name: values.companyName }
        : values.companyMode === "existing"
          ? { mode: "existing", id: values.companyId }
          : { mode: "none" },
    contact:
      values.contactMode === "create"
        ? { mode: "create" }
        : { mode: "existing", id: values.contactId },
    opportunity: withOpportunity
      ? {
          create: true,
          name: values.opportunityName,
          ...(values.opportunityValue ? { value: Number(values.opportunityValue) } : {}),
          ...(values.expectedCloseDate ? { expectedCloseDate: values.expectedCloseDate } : {}),
          ...(values.stageId ? { stageId: values.stageId } : {}),
        }
      : { create: false },
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

// Converts a lead (LEAD-04): it becomes a contact, and if asked a company and an
// opportunity, all owned by the lead's owner. The lead itself stays, read-only, with its
// timeline. After it the user lands on the new opportunity, or else on the contact.
export function ConvertLeadDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { data: stages } = usePipelineStages();
  const [formError, setFormError] = useState<string | null>(null);
  // The form keeps the ids; the names, for the pickers, are kept here beside them.
  const [pickedCompany, setPickedCompany] = useState<CompanyRef | null>(null);
  const [pickedContact, setPickedContact] = useState<ContactRef | null>(null);
  // Whether an opportunity is made as well. A checkbox, kept beside the form's text fields.
  const [withOpportunity, setWithOpportunity] = useState(true);
  const form = useForm<ConvertValues>({
    resolver: zodResolver(convertSchema),
    defaultValues: {
      companyMode: lead.company ? "create" : "none",
      companyName: lead.company ?? "",
      companyId: "",
      contactMode: "create",
      contactId: "",
      opportunityName: lead.company ?? lead.name,
      opportunityValue: lead.estimatedValue === null ? "" : String(lead.estimatedValue),
      expectedCloseDate: "",
      // "" lets the API choose the first open stage.
      stageId: "",
    },
  });
  const { control } = form;
  const companyMode = useWatch({ control, name: "companyMode" });
  const contactMode = useWatch({ control, name: "contactMode" });
  const stageChoices = stageOptions(openStages(stages));

  async function onSubmit(values: ConvertValues) {
    setFormError(null);
    const missing = missingFields(values, withOpportunity);
    if (missing.length > 0) {
      for (const [field, message] of missing) {
        form.setError(field, { type: "required", message });
      }
      return;
    }
    try {
      const converted = await dispatch(
        convertLead({ id: lead.id, input: toInput(values, withOpportunity) }),
      ).unwrap();
      toast.success(`${lead.name} was converted.`);
      onClose();
      const { opportunity, contact } = converted.convertedTo ?? {};
      if (opportunity) {
        router.push(`/opportunities/${opportunity.id}`);
      } else if (contact) {
        router.push(`/contacts/${contact.id}`);
      }
    } catch (error) {
      setFormError(
        applyServerError(withFormFields(error as ApiError), form.setError, CONVERT_FIELDS),
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle className="pr-8 wrap-anywhere">Convert {lead.name}</DialogTitle>
            <DialogDescription>
              This creates the records below for {lead.owner.name}. The lead and its timeline are
              kept, but the lead can no longer be edited.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />

          <Section title="Contact">
            <SegmentedControl
              label="Contact source"
              value={contactMode}
              options={contactModes}
              onChange={(mode) => {
                form.setValue("contactMode", mode);
                form.clearErrors("contactId");
              }}
            />
            {contactMode === "create" ? (
              <p className="text-muted-foreground text-sm wrap-anywhere">
                A new contact, {lead.name}, with the lead&apos;s job title, email, phone and notes.
              </p>
            ) : (
              <FormField
                control={control}
                name="contactId"
                label="Existing contact"
                description="The contact is linked as it is; nothing on it changes."
              >
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
            )}
          </Section>

          <Section title="Company">
            <SegmentedControl
              label="Company source"
              value={companyMode}
              options={companyModes}
              onChange={(mode) => {
                form.setValue("companyMode", mode);
                form.clearErrors(["companyName", "companyId"]);
              }}
            />
            {companyMode === "create" ? (
              <FormField control={control} name="companyName" label="Company name">
                {(field) => <Input {...field} autoComplete="off" className="h-10" />}
              </FormField>
            ) : null}
            {companyMode === "existing" ? (
              <FormField control={control} name="companyId" label="Existing company">
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
            ) : null}
            {companyMode === "none" ? (
              <p className="text-muted-foreground text-sm">No company is created or linked.</p>
            ) : null}
          </Section>

          <Section title="Opportunity">
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={withOpportunity}
                onChange={(event) => {
                  setWithOpportunity(event.target.checked);
                }}
              />
              Create an opportunity
            </label>
            {withOpportunity ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FormField control={control} name="opportunityName" label="Opportunity name">
                    {(field) => <Input {...field} autoComplete="off" className="h-10" />}
                  </FormField>
                </div>
                <FormField control={control} name="opportunityValue" label="Value (USD)">
                  {(field) => (
                    <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
                  )}
                </FormField>
                <FormField control={control} name="expectedCloseDate" label="Expected close date">
                  {(field) => <Input {...field} type="date" className="h-10" />}
                </FormField>
                {stageChoices.length > 0 ? (
                  <div className="sm:col-span-2">
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
                          // Until a stage is picked, the first one shows: the API's default.
                          value={value || (stageChoices[0]?.value ?? "")}
                          onChange={onChange}
                          invalid={invalid}
                          describedBy={describedBy}
                          options={stageChoices}
                        />
                      )}
                    </FormField>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Section>

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Converting..." : "Convert lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
