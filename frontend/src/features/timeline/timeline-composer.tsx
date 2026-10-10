"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { toDateTimeInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

import { addNote, logConversation } from "./timeline.slice";
import type { RecordRef, TimelineEntry } from "./timeline.types";
import {
  CONVERSATION_TYPE_ICONS,
  CONVERSATION_TYPE_LABELS,
  CONVERSATION_TYPES,
} from "./timeline-labels";

const MAX_TEXT = 5000;
// The API accepts a time up to five minutes ahead, for a clock that runs fast.
const FUTURE_ALLOWANCE_MS = 5 * 60 * 1000;

const MODES = [
  { value: "CONVERSATION", label: "Conversation" },
  { value: "NOTE", label: "Note" },
] as const;

// One form for both modes, so what was typed stays when the mode is switched. `text` is
// the conversation's summary or the note's body; the date matters only for a conversation.
const composerSchema = z
  .object({
    mode: z.enum(["CONVERSATION", "NOTE"]),
    type: z.enum(CONVERSATION_TYPES),
    // The value of a datetime-local input: "2026-10-05T09:30", in the user's time zone.
    occurredAt: z.string(),
    text: z
      .string()
      .trim()
      .max(MAX_TEXT, `Use ${String(MAX_TEXT)} characters or fewer.`),
  })
  .superRefine((values, context) => {
    if (values.text === "") {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: values.mode === "NOTE" ? "Write the note first." : "Write what was discussed.",
      });
    }
    if (values.mode === "NOTE") {
      return;
    }
    const time = new Date(values.occurredAt).getTime();
    if (values.occurredAt === "" || Number.isNaN(time)) {
      context.addIssue({
        code: "custom",
        path: ["occurredAt"],
        message: "Enter the date and time.",
      });
    } else if (time > Date.now() + FUTURE_ALLOWANCE_MS) {
      context.addIssue({
        code: "custom",
        path: ["occurredAt"],
        message: "The date and time cannot be in the future.",
      });
    }
  });

type ComposerValues = z.infer<typeof composerSchema>;

function emptyValues(mode: ComposerValues["mode"]): ComposerValues {
  return { mode, type: "CALL", occurredAt: toDateTimeInputValue(new Date()), text: "" };
}

// The API names the text `summary` (a conversation) or `body` (a note); the form has one
// box for both. This points the server's message for either at that box.
function forTextField(error: ApiError): ApiError {
  if (!Array.isArray(error.details)) {
    return error;
  }
  const details = (error.details as unknown[]).map((detail) =>
    typeof detail === "object" &&
    detail !== null &&
    "path" in detail &&
    (detail.path === "summary" || detail.path === "body")
      ? { ...detail, path: "text" }
      : detail,
  );
  return { ...error, details };
}

// The form that adds to a record's timeline: a conversation (type, when, what was
// discussed) or a plain note. `layout="sheet"` is the phone's full-screen dialog: larger
// type buttons, a bigger text box, and Save in a bar that stays at the bottom while the
// fields scroll.
export function TimelineComposer({
  record,
  layout = "inline",
  autoFocus = false,
  onSaved,
}: {
  record: RecordRef;
  layout?: "inline" | "sheet";
  // Put the cursor in the text box when the form appears.
  autoFocus?: boolean;
  onSaved?: (entry: TimelineEntry) => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: emptyValues("CONVERSATION"),
  });
  const mode = useWatch({ control: form.control, name: "mode" });
  const sheet = layout === "sheet";
  const textBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      textBox.current?.focus();
    }
  }, [autoFocus]);

  async function onSubmit(values: ComposerValues) {
    setFormError(null);
    try {
      const entry =
        values.mode === "NOTE"
          ? await dispatch(addNote({ record, input: { body: values.text } })).unwrap()
          : await dispatch(
              logConversation({
                record,
                input: {
                  type: values.type,
                  occurredAt: new Date(values.occurredAt).toISOString(),
                  summary: values.text,
                },
              }),
            ).unwrap();
      toast.success(values.mode === "NOTE" ? "Note added." : "Conversation logged.");
      // A clean form in the same mode, with the time set to now, ready for the next one.
      form.reset(emptyValues(values.mode));
      textBox.current?.focus();
      onSaved?.(entry);
    } catch (error) {
      // The form keeps what was typed, so nothing has to be written twice.
      setFormError(
        applyServerError(forTextField(error as ApiError), form.setError, ["occurredAt", "text"]),
      );
    }
  }

  return (
    <form
      noValidate
      aria-label="Add to timeline"
      className={cn("flex min-w-0 flex-col", sheet ? "min-h-0 flex-1" : "gap-4")}
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <div className={cn("flex min-w-0 flex-col gap-4", sheet && "flex-1 overflow-y-auto p-4")}>
        <SegmentedControl
          label="What to add"
          className={sheet ? undefined : "self-start"}
          value={mode}
          options={MODES}
          onChange={(next) => {
            form.setValue("mode", next);
            form.clearErrors();
            setFormError(null);
          }}
        />
        <FormAlert message={formError} />

        {mode === "CONVERSATION" ? (
          <div className="grid grid-cols-1 gap-4">
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium">Type</legend>
              <div className="grid grid-cols-4 gap-2">
                {CONVERSATION_TYPES.map((type) => {
                  const Icon = CONVERSATION_TYPE_ICONS[type];
                  return (
                    <label
                      key={type}
                      className={cn(
                        "bg-background has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-ring/50 relative flex min-w-0 cursor-pointer items-center justify-center rounded-lg border font-medium has-focus-visible:ring-3",
                        sheet ? "h-16 flex-col gap-1 text-sm" : "h-10 gap-1.5 px-2 text-sm",
                      )}
                    >
                      <input
                        type="radio"
                        value={type}
                        className="sr-only"
                        {...form.register("type")}
                      />
                      <Icon aria-hidden className={cn("shrink-0", sheet ? "size-5" : "size-4")} />
                      <span className="max-w-full truncate">{CONVERSATION_TYPE_LABELS[type]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <FormField control={form.control} name="occurredAt" label="Date and time">
              {(field) => (
                <Input
                  {...field}
                  type="datetime-local"
                  className={sheet ? "h-12" : "h-10 sm:max-w-60"}
                />
              )}
            </FormField>
          </div>
        ) : null}

        <FormField
          control={form.control}
          name="text"
          label={mode === "NOTE" ? "Note" : "What was discussed?"}
        >
          {(field) => (
            <Textarea
              {...field}
              ref={(element) => {
                field.ref(element);
                textBox.current = element;
              }}
              rows={sheet ? 6 : 3}
              placeholder={
                mode === "NOTE"
                  ? "Anything worth remembering about this record"
                  : "What you talked about and what was agreed"
              }
              className={sheet ? "min-h-40" : "max-h-80 min-h-24"}
            />
          )}
        </FormField>
      </div>

      <div
        className={cn(
          "flex",
          sheet
            ? "bg-background border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            : "justify-end",
        )}
      >
        <Button
          type="submit"
          className={sheet ? "h-12 w-full text-base" : "h-10 px-4"}
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting
            ? "Saving..."
            : mode === "NOTE"
              ? "Save note"
              : "Save conversation"}
        </Button>
      </div>
    </form>
  );
}
