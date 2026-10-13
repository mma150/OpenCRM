"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Eye, Info, Pencil, Send } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectControl } from "@/components/shared/select-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { selectAuth } from "@/features/auth/auth.slice";
import { fetchEmailStatus } from "@/features/email-settings/email-settings.slice";
import { useEmailStatus } from "@/features/email-settings/use-email-status";
import {
  emailBodySchema,
  emailSubjectSchema,
  MAX_EMAIL_BODY,
  MAX_EMAIL_SUBJECT,
} from "@/features/email-templates/email-template-labels";
import {
  fetchEmailTemplates,
  selectEmailTemplates,
} from "@/features/email-templates/email-templates.slice";
import type { EmailTemplate } from "@/features/email-templates/email-templates.types";
import {
  PlaceholderMenu,
  usePlaceholderInserter,
} from "@/features/email-templates/placeholder-inserter";
import { sendEmail } from "@/features/timeline/timeline.slice";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useIsPhone } from "@/lib/use-is-phone";
import { FULL_SCREEN_DIALOG, useVisibleHeight } from "@/lib/use-visible-height";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { recordRefOf } from "./email-record";
import { getEmailDefaults, previewEmail } from "./emails.api";
import type { EmailMessage, EmailPreview, EmailRecipient, EmailRecord } from "./emails.types";
import { MAX_RECIPIENTS } from "./recipients";
import { RecipientsInput } from "./recipients-input";

export type SendEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The record the email is sent from; its defaults fill "To" and its values fill the preview.
  record: EmailRecord;
  recordName: string;
  // The dialog's title; "Send email" when left out. A quote passes "Email quote Q-0001".
  title?: string;
  // A line above the form: a quote says there that the email carries a text summary of the
  // quote, not an attachment.
  note?: ReactNode;
  // What the subject and body start with (a quote's own wording).
  initial?: { subject?: string; body?: string };
  // True for a quote's email: {{quote.number}} and {{quote.total}} are filled in when it is
  // sent, so the preview must not warn about them.
  withQuotePlaceholders?: boolean;
  // Replaces POST /emails: a quote sends through POST /quotes/:id/send. It rejects with an
  // ApiError, which the dialog shows like its own (the draft stays).
  send?: (message: EmailMessage) => Promise<void>;
  onSent?: () => void;
};

// The placeholders only an email with a quote has.
const QUOTE_PLACEHOLDERS = ["quote.number", "quote.total"];

const composerSchema = z.object({
  to: z
    .array(z.string())
    .min(1, "Add at least one address.")
    .max(MAX_RECIPIENTS, `Use ${String(MAX_RECIPIENTS)} addresses or fewer.`),
  cc: z.array(z.string()).max(MAX_RECIPIENTS, `Use ${String(MAX_RECIPIENTS)} addresses or fewer.`),
  // The template the text came from, "" for none. It only records where the text came from.
  templateId: z.string(),
  subject: emailSubjectSchema,
  body: emailBodySchema,
});

type ComposerValues = z.infer<typeof composerSchema>;

const FIELDS = ["to", "cc", "subject", "body", "templateId"] as const;

const linkClass =
  "text-primary rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

// The API names one address of a list by its place ("to.0", "cc.2"); the form has one field
// for the whole list.
function forFormFields(error: ApiError): ApiError {
  if (!Array.isArray(error.details)) {
    return error;
  }
  const details = (error.details as unknown[]).map((detail) => {
    if (typeof detail !== "object" || detail === null || !("path" in detail)) {
      return detail;
    }
    const list = typeof detail.path === "string" ? /^(to|cc)\.\d+$/.exec(detail.path) : null;
    return list ? { ...detail, path: list[1] } : detail;
  });
  return { ...error, details };
}

// "Try again in 3 minutes", from the API's details.retryAfterSeconds.
function rateLimitMessage(details: unknown): string {
  const seconds =
    typeof details === "object" && details !== null && "retryAfterSeconds" in details
      ? details.retryAfterSeconds
      : null;
  const sentence = "You have sent a lot of emails in a short time, so this one was not sent.";
  if (typeof seconds !== "number" || seconds <= 0) {
    return `${sentence} Try again in a few minutes.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${sentence} Try again in ${minutes === 1 ? "1 minute" : `${String(minutes)} minutes`}.`;
}

// Why sending is not possible while email is off, with the way out for whoever has one.
function EmailOffNotice({ isAdmin, onCheckAgain }: { isAdmin: boolean; onCheckAgain: () => void }) {
  return (
    <Alert>
      <Info aria-hidden />
      <AlertDescription>
        <p>
          Outgoing email is not set up, so this email cannot be sent yet. You can still write and
          preview it.{" "}
          {isAdmin ? (
            <Link href="/settings/email" className={linkClass}>
              Set up email
            </Link>
          ) : (
            "Ask an Admin to set it up under Settings, Email."
          )}
        </p>
        <Button type="button" variant="outline" className="mt-2 h-9 px-3" onClick={onCheckAgain}>
          Check again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// The email as it will read for this record, and what to know about its placeholders.
function PreviewPanel({
  preview,
  to,
  cc,
  withQuotePlaceholders,
}: {
  preview: EmailPreview;
  to: string[];
  cc: string[];
  withQuotePlaceholders: boolean;
}) {
  // The quote's own placeholders have no value until the quote is sent with the email.
  const later = withQuotePlaceholders
    ? preview.empty.filter((key) => QUOTE_PLACEHOLDERS.includes(key))
    : [];
  const empty = preview.empty.filter((key) => !later.includes(key));
  const token = (key: string) => <code className="font-mono">{`{{${key}}}`}</code>;

  return (
    <section aria-label="Preview" className="flex min-w-0 flex-col gap-3">
      {preview.unknown.length > 0 || empty.length > 0 ? (
        <Alert>
          <CircleAlert aria-hidden />
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {preview.unknown.map((key) => (
                <li key={`unknown-${key}`} className="wrap-anywhere">
                  {token(key)} is not a placeholder OpenCRM knows. It will be sent as typed.
                </li>
              ))}
              {empty.map((key) => (
                <li key={`empty-${key}`} className="wrap-anywhere">
                  {token(key)}: this record has no value for it, so it is left blank.
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {later.length > 0 ? (
        <p className="text-muted-foreground text-sm wrap-anywhere">
          {later.map((key, index) => (
            <span key={key}>
              {index > 0 ? " and " : null}
              {token(key)}
            </span>
          ))}{" "}
          {later.length === 1 ? "is" : "are"} filled in when the email is sent.
        </p>
      ) : null}
      <div className="bg-muted/40 flex min-w-0 flex-col gap-3 rounded-lg border p-3 md:p-4">
        <dl className="text-muted-foreground flex min-w-0 flex-col gap-0.5 text-xs wrap-anywhere">
          <div className="flex min-w-0 gap-1">
            <dt>To:</dt>
            <dd className="min-w-0">{to.length > 0 ? to.join(", ") : "nobody yet"}</dd>
          </div>
          {cc.length > 0 ? (
            <div className="flex min-w-0 gap-1">
              <dt>Cc:</dt>
              <dd className="min-w-0">{cc.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-base font-semibold wrap-anywhere">{preview.subject}</p>
        <p className="text-sm wrap-anywhere whitespace-pre-wrap">{preview.body}</p>
      </div>
    </section>
  );
}

function Composer({
  record,
  recordName,
  note,
  initial,
  withQuotePlaceholders = false,
  send,
  onSent,
  sheet,
  onClose,
  onBusyChange,
}: Omit<SendEmailDialogProps, "open" | "onOpenChange" | "title"> & {
  sheet: boolean;
  onClose: () => void;
  // True while the email is on its way: the dialog must not be closed under it.
  onBusyChange: (busy: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: templates } = useAppSelector(selectEmailTemplates);
  const { enabled } = useEmailStatus();
  const [formError, setFormError] = useState<string | null>(null);
  // The API said email is off although the status said otherwise a moment ago.
  const [refused, setRefused] = useState(false);
  // What is typed in "To" and "Cc" and is not an address yet.
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  // A template chosen while there is text of the user's own waits here for a yes.
  const [replacing, setReplacing] = useState<EmailTemplate | null>(null);
  const [preview, setPreview] = useState<{ loading: boolean; data: EmailPreview | null }>({
    loading: false,
    data: null,
  });
  // The text the last applied template (or `initial`) put in the boxes: text that is still
  // exactly that was not written by the user and may be replaced without asking.
  const start = { subject: initial?.subject ?? "", body: initial?.body ?? "" };
  const given = useRef(start);

  const form = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: { to: [], cc: [], templateId: "", ...start },
  });
  const to = useWatch({ control: form.control, name: "to" });
  const cc = useWatch({ control: form.control, name: "cc" });
  const sending = form.formState.isSubmitting;

  const inserter = usePlaceholderInserter({
    getValue: (field) => form.getValues(field),
    setValue: (field, text) => {
      form.setValue(field, text, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    },
  });

  useEffect(() => {
    void dispatch(fetchEmailTemplates());
  }, [dispatch]);

  useEffect(() => {
    onBusyChange(sending);
  }, [sending, onBusyChange]);

  // Who an email from this record usually goes to. One address is filled in; several (the
  // contacts of a company) are offered to pick from, because writing to all of them at once
  // is rarely what is meant. A record without an address leaves "To" for the user to type.
  const { type: recordType, id: recordId } = record;
  useEffect(() => {
    let current = true;
    getEmailDefaults({ type: recordType, id: recordId })
      .then((defaults) => {
        if (!current) {
          return;
        }
        setRecipients(defaults.recipients);
        const [only] = defaults.recipients;
        if (defaults.recipients.length === 1 && only && form.getValues("to").length === 0) {
          form.setValue("to", [only.email.toLowerCase()]);
        }
      })
      .catch(() => {
        // Without the defaults the user types the address; nothing else depends on them.
      });
    return () => {
      current = false;
    };
  }, [recordType, recordId, form]);

  if (!me) {
    return null;
  }

  const names = Object.fromEntries(
    recipients.map((recipient) => [recipient.email.toLowerCase(), recipient.name]),
  );
  const suggestions = recipients.filter((recipient) => {
    const address = recipient.email.toLowerCase();
    return !to.includes(address) && !cc.includes(address);
  });
  const emailOff = enabled === false || refused;

  function applyTemplate(template: EmailTemplate) {
    given.current = { subject: template.subject, body: template.body };
    form.setValue("templateId", template.id, { shouldDirty: true });
    form.clearErrors("templateId");
    form.setValue("subject", template.subject, { shouldDirty: true, shouldValidate: true });
    form.setValue("body", template.body, { shouldDirty: true, shouldValidate: true });
    setPreview({ loading: false, data: null });
  }

  function chooseTemplate(id: string) {
    const template = templates?.find((candidate) => candidate.id === id);
    if (!template) {
      return;
    }
    const { subject, body } = form.getValues();
    const empty = subject.trim() === "" && body.trim() === "";
    const untouched = subject === given.current.subject && body === given.current.body;
    if (empty || untouched) {
      applyTemplate(template);
    } else {
      setReplacing(template);
    }
  }

  async function showPreview() {
    setFormError(null);
    if (!(await form.trigger(["subject", "body"]))) {
      return;
    }
    const { subject, body } = form.getValues();
    setPreview({ loading: true, data: null });
    try {
      const data = await previewEmail({ record, subject, body });
      setPreview({ loading: false, data });
    } catch (caught) {
      setPreview({ loading: false, data: null });
      setFormError(
        applyServerError(forFormFields(caught as ApiError), form.setError, ["subject", "body"]),
      );
    }
  }

  async function onSubmit(values: ComposerValues) {
    setFormError(null);
    // Something typed that never became an address must not be dropped without a word.
    const unfinished = toText.trim() !== "" ? "To" : ccText.trim() !== "" ? "Cc" : null;
    if (unfinished) {
      setPreview({ loading: false, data: null });
      setFormError(
        `Something in "${unfinished}" is not an address yet. Correct it or clear it, then send.`,
      );
      return;
    }
    const message: EmailMessage = {
      to: values.to,
      ...(values.cc.length > 0 ? { cc: values.cc } : {}),
      subject: values.subject,
      body: values.body,
      ...(values.templateId ? { templateId: values.templateId } : {}),
    };
    try {
      if (send) {
        await send(message);
      } else {
        await dispatch(sendEmail({ record: recordRefOf(record), input: message })).unwrap();
      }
    } catch (caught) {
      // Whatever went wrong, the draft stays as it is and the dialog stays open.
      const error = caught as ApiError;
      setPreview({ loading: false, data: null });
      if (error.code === "EMAIL_NOT_CONFIGURED") {
        setRefused(true);
        void dispatch(fetchEmailStatus());
        setFormError("Outgoing email is not set up, so nothing was sent. Your draft is kept.");
      } else if (error.code === "RATE_LIMITED") {
        setFormError(rateLimitMessage(error.details));
      } else {
        const message = applyServerError(forFormFields(error), form.setError, FIELDS);
        setFormError(message);
        if (form.getFieldState("cc").invalid) {
          setShowCc(true);
        }
      }
      return;
    }
    const [first = "", ...others] = values.to;
    const more = others.length + values.cc.length;
    toast.success(
      more === 0 ? `Email sent to ${first}.` : `Email sent to ${first} and ${String(more)} more.`,
    );
    onClose();
    onSent?.();
  }

  const templateOptions = (templates ?? []).map((template) => ({
    value: template.id,
    label:
      template.shared && template.owner.id !== me.id ? `${template.name} (shared)` : template.name,
  }));

  return (
    <form
      noValidate
      aria-label="Email"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(event) =>
        void form.handleSubmit(onSubmit, () => {
          // The fields with a problem are behind the preview: go back to them.
          setPreview({ loading: false, data: null });
        })(event)
      }
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-4">
        {note ? (
          <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            {note}
          </p>
        ) : null}
        {emailOff ? (
          <EmailOffNotice
            isAdmin={me.role === "ADMIN"}
            onCheckAgain={() => {
              setRefused(false);
              void dispatch(fetchEmailStatus());
            }}
          />
        ) : null}
        <FormAlert message={formError} />

        {preview.data ? (
          <PreviewPanel
            preview={preview.data}
            to={to}
            cc={cc}
            withQuotePlaceholders={withQuotePlaceholders}
          />
        ) : null}

        {/* The fields stay in the page behind the preview, so nothing typed is lost. */}
        <div className={cn("grid min-w-0 grid-cols-1 gap-4", preview.data && "hidden")}>
          <FormField
            control={form.control}
            name="to"
            label="To"
            labelAction={
              showCc ? null : (
                <button
                  type="button"
                  className={cn(linkClass, "text-sm no-underline hover:underline")}
                  onClick={() => {
                    setShowCc(true);
                  }}
                >
                  Add Cc
                </button>
              )
            }
          >
            {({ id, value, onChange, onBlur, "aria-invalid": invalid, "aria-describedby": by }) => (
              <RecipientsInput
                id={id}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                text={toText}
                onTextChange={setToText}
                names={names}
                invalid={invalid}
                describedBy={by}
                placeholder="name@example.com"
              />
            )}
          </FormField>
          {suggestions.length > 0 && recipients.length > 1 ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-muted-foreground text-xs">Contacts of {recordName}:</p>
              <ul
                aria-label="Suggested recipients"
                className="flex max-h-28 min-w-0 flex-wrap gap-1.5 overflow-y-auto"
              >
                {suggestions.map((recipient) => (
                  <li key={recipient.email} className="max-w-full min-w-0">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 max-w-full px-2.5"
                      disabled={to.length >= MAX_RECIPIENTS}
                      aria-label={`Add ${recipient.name} (${recipient.email}) to To`}
                      onClick={() => {
                        form.setValue("to", [...to, recipient.email.toLowerCase()], {
                          shouldDirty: true,
                          shouldValidate: form.formState.isSubmitted,
                        });
                      }}
                    >
                      <span className="truncate">+ {recipient.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {showCc ? (
            <FormField control={form.control} name="cc" label="Cc">
              {({
                id,
                value,
                onChange,
                onBlur,
                "aria-invalid": invalid,
                "aria-describedby": by,
              }) => (
                <RecipientsInput
                  id={id}
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  text={ccText}
                  onTextChange={setCcText}
                  names={names}
                  invalid={invalid}
                  describedBy={by}
                />
              )}
            </FormField>
          ) : null}
          {templateOptions.length > 0 ? (
            <FormField
              control={form.control}
              name="templateId"
              label="Template"
              description="Fills in the subject and the message. You can change them afterwards."
            >
              {({ id, value, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <SelectControl
                  id={id}
                  value={value}
                  onChange={chooseTemplate}
                  invalid={invalid}
                  describedBy={describedBy}
                  options={templateOptions}
                  placeholder="Choose a template"
                />
              )}
            </FormField>
          ) : null}
          <FormField control={form.control} name="subject" label="Subject">
            {(field) => (
              <Input
                {...field}
                {...inserter.bind("subject", field)}
                maxLength={MAX_EMAIL_SUBJECT}
                className={sheet ? "h-12" : "h-10"}
                // Enter in a one-line box would send the email: too easy to do by accident.
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
              />
            )}
          </FormField>
          <FormField
            control={form.control}
            name="body"
            label="Message"
            labelAction={
              <PlaceholderMenu
                onInsert={inserter.insert}
                onClosed={inserter.restoreFocus}
                include={(placeholder) =>
                  withQuotePlaceholders || !QUOTE_PLACEHOLDERS.includes(placeholder.key)
                }
              />
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
          <p className="text-muted-foreground text-xs wrap-anywhere">
            Sent as plain text from {me.name}; replies go to {me.email}. The email is added to the
            timeline of {recordName}.
          </p>
        </div>
      </div>

      <div
        className={cn(
          "bg-background flex flex-wrap items-center gap-2 border-t p-4",
          sheet ? "pb-[calc(1rem+env(safe-area-inset-bottom))]" : "rounded-b-xl",
        )}
      >
        {preview.data ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            onClick={() => {
              setPreview({ loading: false, data: null });
            }}
          >
            <Pencil aria-hidden />
            Back to editing
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            disabled={preview.loading || sending}
            onClick={() => void showPreview()}
          >
            <Eye aria-hidden />
            {preview.loading ? "Loading preview..." : "Preview"}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            disabled={sending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" className="h-10 px-4" disabled={sending || emailOff}>
            <Send aria-hidden />
            {sending ? "Sending..." : "Send email"}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={replacing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReplacing(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="wrap-anywhere">Replace what you wrote?</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">
              The template {replacing ? `"${replacing.name}" ` : null}replaces the subject and the
              message you have now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 px-4">Keep my text</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 px-4"
              onClick={() => {
                if (replacing) {
                  applyTemplate(replacing);
                }
                setReplacing(null);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

// The email composer: To and Cc as chips, a template, subject and message with the
// placeholder menu, a preview of how it reads for this record, and Send. A dialog on wide
// screens and full-screen on a phone. Whatever goes wrong while sending, the dialog stays
// open with the draft as it was.
//
//   <SendEmailDialog open={open} onOpenChange={setOpen}
//     record={{ type: "LEAD", id: lead.id }} recordName={lead.name} />
//
// Without `send` it posts to /emails and the new entry joins the record's timeline at once.
export function SendEmailDialog({ open, onOpenChange, title, ...composer }: SendEmailDialogProps) {
  const isPhone = useIsPhone();
  const [busy, setBusy] = useState(false);
  useVisibleHeight(isPhone && open);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Not while the email is on its way: its answer would have nowhere to go.
        if (next || !busy) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        className={
          isPhone ? FULL_SCREEN_DIALOG : "flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl"
        }
        // A click beside the dialog must not throw a half-written email away.
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle className="text-lg wrap-anywhere">{title ?? "Send email"}</DialogTitle>
          <DialogDescription className="wrap-anywhere">{composer.recordName}</DialogDescription>
        </DialogHeader>
        <Composer
          {...composer}
          sheet={isPhone}
          onClose={() => {
            onOpenChange(false);
          }}
          onBusyChange={setBusy}
        />
      </DialogContent>
    </Dialog>
  );
}
