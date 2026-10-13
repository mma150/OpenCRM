"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { DeleteRecordDialog } from "@/components/shared/record-dialogs";
import { DetailItem, DetailList } from "@/components/shared/record-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useIsPhone } from "@/lib/use-is-phone";
import { FULL_SCREEN_DIALOG, useVisibleHeight } from "@/lib/use-visible-height";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

import {
  emailBodySchema,
  emailSubjectSchema,
  MAX_EMAIL_BODY,
  MAX_EMAIL_SUBJECT,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATES,
} from "./email-template-labels";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  fetchEmailTemplates,
  updateEmailTemplate,
} from "./email-templates.slice";
import type { EmailTemplate, UpdateEmailTemplateInput } from "./email-templates.types";
import { PlaceholderMenu, usePlaceholderInserter } from "./placeholder-inserter";

// The dialog the templates page can open. "view" is a shared template the user may use but
// not change.
export type EmailTemplateDialog =
  { kind: "add" } | { kind: "edit" | "view" | "delete"; template: EmailTemplate } | null;

export const TEMPLATE_LIMIT_MESSAGE = `You already have ${String(MAX_TEMPLATES)} templates, which is the most one person can have. Delete one you no longer use first.`;

// The API refuses an action that does not apply (a 201st template) as VALIDATION_FAILED
// without naming a field. The dialog then says why in its own words.
function isNotApplicable(error: ApiError): boolean {
  return error.code === "VALIDATION_FAILED" && !Array.isArray(error.details);
}

const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(MAX_TEMPLATE_NAME, `Use ${String(MAX_TEMPLATE_NAME)} characters or fewer.`),
  subject: emailSubjectSchema,
  body: emailBodySchema,
  shared: z.boolean(),
});

type TemplateValues = z.infer<typeof templateSchema>;

const FIELDS = ["name", "subject", "body", "shared"] as const;

// Only what the user actually changed is sent. A user who may not share never sends
// `shared`: the API answers that with FORBIDDEN, whatever its value.
function changedFields(
  template: EmailTemplate,
  values: TemplateValues,
  canShare: boolean,
): UpdateEmailTemplateInput {
  const changes: UpdateEmailTemplateInput = {};
  if (values.name !== template.name) {
    changes.name = values.name;
  }
  if (values.subject !== template.subject) {
    changes.subject = values.subject;
  }
  if (values.body !== template.body) {
    changes.body = values.body;
  }
  if (canShare && values.shared !== template.shared) {
    changes.shared = values.shared;
  }
  return changes;
}

function TemplateForm({
  template,
  canShare,
  sheet,
  onClose,
}: {
  template?: EmailTemplate;
  canShare: boolean;
  sheet: boolean;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<TemplateValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name ?? "",
      subject: template?.subject ?? "",
      body: template?.body ?? "",
      shared: template?.shared ?? false,
    },
  });
  const inserter = usePlaceholderInserter({
    getValue: (field) => form.getValues(field),
    setValue: (field, text) => {
      form.setValue(field, text, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    },
  });

  async function onSubmit(values: TemplateValues) {
    setFormError(null);
    try {
      if (template) {
        const changes = changedFields(template, values, canShare);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await dispatch(updateEmailTemplate({ id: template.id, changes })).unwrap();
        toast.success("Template saved.");
      } else {
        const { shared, ...text } = values;
        await dispatch(createEmailTemplate(canShare ? { ...text, shared } : text)).unwrap();
        toast.success("Template added.");
      }
      // The list is the API's: a template someone else owns leaves it when it stops being shared.
      void dispatch(fetchEmailTemplates());
      onClose();
    } catch (caught) {
      const error = caught as ApiError;
      setFormError(
        isNotApplicable(error)
          ? TEMPLATE_LIMIT_MESSAGE
          : applyServerError(error, form.setError, FIELDS),
      );
    }
  }

  return (
    <form
      noValidate
      aria-label={template ? "Edit template" : "New template"}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-4">
        <FormAlert message={formError} />
        <FormField
          control={form.control}
          name="name"
          label="Name"
          description="What you pick it by when you write an email. Not sent."
        >
          {(field) => (
            <Input
              {...field}
              maxLength={MAX_TEMPLATE_NAME}
              placeholder="Follow-up after demo"
              className={sheet ? "h-12" : "h-10"}
            />
          )}
        </FormField>
        <FormField control={form.control} name="subject" label="Subject">
          {(field) => (
            <Input
              {...field}
              {...inserter.bind("subject", field)}
              maxLength={MAX_EMAIL_SUBJECT}
              className={sheet ? "h-12" : "h-10"}
            />
          )}
        </FormField>
        <FormField
          control={form.control}
          name="body"
          label="Message"
          description="Plain text. A placeholder is filled in from the record when the email is sent."
          labelAction={
            <PlaceholderMenu onInsert={inserter.insert} onClosed={inserter.restoreFocus} />
          }
        >
          {(field) => (
            <Textarea
              {...field}
              {...inserter.bind("body", field)}
              rows={8}
              maxLength={MAX_EMAIL_BODY}
              className="max-h-[50dvh] min-h-40"
            />
          )}
        </FormField>
        {canShare ? (
          <Controller
            control={form.control}
            name="shared"
            render={({ field }) => (
              <label className="flex min-w-0 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5 size-4 shrink-0"
                  checked={field.value}
                  onChange={(event) => {
                    field.onChange(event.target.checked);
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">Shared with everyone</span>
                  <span className="text-muted-foreground text-xs">
                    Everyone on the team can use it. Only you and Admins can change it.
                  </span>
                </span>
              </label>
            )}
          />
        ) : null}
      </div>

      <div
        className={cn(
          "bg-background flex flex-wrap items-center justify-end gap-2 border-t p-4",
          sheet ? "pb-[calc(1rem+env(safe-area-inset-bottom))]" : "rounded-b-xl",
        )}
      >
        <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : template ? "Save changes" : "Add template"}
        </Button>
      </div>
    </form>
  );
}

// A shared template the user may use but not change: its text, with nothing to edit.
function TemplateDetails({ template, onClose }: { template: EmailTemplate; onClose: () => void }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <DetailList>
          <DetailItem label="Subject">
            <span className="wrap-anywhere">{template.subject}</span>
          </DetailItem>
          <DetailItem label="Message">
            <span className="wrap-anywhere whitespace-pre-wrap">{template.body}</span>
          </DetailItem>
        </DetailList>
      </div>
      <div className="bg-background flex justify-end border-t p-4 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))] md:rounded-b-xl">
        <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}

// Adds a template, edits one, or shows one the user may not change. Full-screen on a phone,
// like the task dialog, with Save in a bar at the bottom.
function TemplateDialog({
  template,
  readOnly = false,
  canShare,
  onClose,
}: {
  template?: EmailTemplate;
  readOnly?: boolean;
  canShare: boolean;
  onClose: () => void;
}) {
  const isPhone = useIsPhone();
  useVisibleHeight(isPhone);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={
          isPhone ? FULL_SCREEN_DIALOG : "flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl"
        }
      >
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle className="text-lg wrap-anywhere">
            {template ? (readOnly ? template.name : "Edit template") : "New template"}
          </DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {template
              ? readOnly
                ? `Shared by ${template.owner.name}. You can use it in an email, but not change it.`
                : "Emails already sent keep the text they were sent with."
              : "A reusable email. You choose it when you write an email and can still change the text."}
          </DialogDescription>
        </DialogHeader>
        {template && readOnly ? (
          <TemplateDetails template={template} onClose={onClose} />
        ) : (
          <TemplateForm template={template} canShare={canShare} sheet={isPhone} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EmailTemplateDialogs({
  dialog,
  canShare,
  onClose,
}: {
  dialog: EmailTemplateDialog;
  // Admin and Sales Manager: the dialog offers "Shared with everyone".
  canShare: boolean;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();

  if (!dialog) {
    return null;
  }
  switch (dialog.kind) {
    case "add":
      return <TemplateDialog canShare={canShare} onClose={onClose} />;
    case "edit":
      return <TemplateDialog template={dialog.template} canShare={canShare} onClose={onClose} />;
    case "view":
      return (
        <TemplateDialog template={dialog.template} readOnly canShare={false} onClose={onClose} />
      );
    case "delete":
      return (
        <DeleteRecordDialog
          name={dialog.template.name}
          description={
            dialog.template.shared
              ? "The template is removed for everyone it is shared with. Emails already sent keep their text. This cannot be undone."
              : "Emails already sent keep their text. This cannot be undone."
          }
          onDelete={() => dispatch(deleteEmailTemplate(dialog.template.id)).unwrap()}
          onClose={onClose}
        />
      );
  }
}
