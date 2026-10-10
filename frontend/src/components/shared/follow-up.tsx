"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BellPlus, BellRing } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { formatNearDateTime, isPast, toDateTimeInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";

import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";

// The follow-up reminder of a lead or an opportunity: one moment and a note. The record's
// owner gets a notification when it is due. A feature hands over what the record has and
// its own request; this draws the rest, like the shared record dialogs:
//
//   <FollowUp at={lead.followUpAt} note={lead.followUpNote} canSet={open} canClear
//     onSave={(input) => dispatch(setLeadFollowUp({ id: lead.id, input })).unwrap()} />

const MAX_NOTE = 500;

export type FollowUpInput = { at: string | null; note?: string | null };

const followUpSchema = z.object({
  // The value of a datetime-local input: "2026-10-05T09:30", in the user's time zone.
  at: z
    .string()
    .refine((value) => value !== "" && !Number.isNaN(new Date(value).getTime()), {
      message: "Enter the date and time.",
    })
    .refine((value) => value === "" || new Date(value).getTime() > Date.now(), {
      message: "Choose a time that is still to come.",
    }),
  note: z
    .string()
    .trim()
    .max(MAX_NOTE, `Use ${String(MAX_NOTE)} characters or fewer.`),
});

type FollowUpValues = z.infer<typeof followUpSchema>;

// Tomorrow at nine in the morning: the usual "call them back tomorrow".
function tomorrowMorning(): string {
  const now = new Date();
  return toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0));
}

function FollowUpDialog({
  at,
  note,
  onSave,
  onClose,
}: {
  at: string | null;
  note: string | null;
  onSave: (input: FollowUpInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FollowUpValues>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      // A follow-up that has passed starts from tomorrow, like a new one.
      at: at && !isPast(at) ? toDateTimeInputValue(new Date(at)) : tomorrowMorning(),
      note: note ?? "",
    },
  });

  async function onSubmit(values: FollowUpValues) {
    setFormError(null);
    try {
      await onSave({ at: new Date(values.at).toISOString(), note: values.note || null });
      toast.success("Follow-up set.");
      onClose();
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["at", "note"]));
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{at ? "Change follow-up" : "Set follow-up"}</DialogTitle>
          <DialogDescription>
            The owner gets a notification at that moment, in the app and by email.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Follow-up"
          className="grid grid-cols-1 gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormAlert message={formError} />
          <FormField control={form.control} name="at" label="Follow up on">
            {(field) => <Input {...field} type="datetime-local" className="h-10" />}
          </FormField>
          <FormField control={form.control} name="note" label="Note">
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                placeholder="What to do or ask"
                className="max-h-40 min-h-20"
              />
            )}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save follow-up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The strip under a record's header: the follow-up that is set, with Change and Clear, or
// the "Set follow-up" button. It renders nothing when there is nothing to show or do.
export function FollowUp({
  at,
  note,
  canSet,
  canClear,
  onSave,
}: {
  at: string | null;
  note: string | null;
  // May a follow-up be set or moved: the user may change the record, and the record still
  // takes one (the API refuses a converted or lost lead and a closed opportunity).
  canSet: boolean;
  // May the one that is set be cleared: any user who may change the record.
  canClear: boolean;
  // Sends the request. A rejection (an ApiError) is shown by this component.
  onSave: (input: FollowUpInput) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      await onSave({ at: null });
      toast.success("Follow-up cleared.");
    } catch (error) {
      toast.error(describeApiError(error as ApiError));
    } finally {
      setClearing(false);
    }
  }

  const dialog = editing ? (
    <FollowUpDialog
      at={at}
      note={note}
      onSave={onSave}
      onClose={() => {
        setEditing(false);
      }}
    />
  ) : null;

  if (at === null) {
    return canSet ? (
      <>
        <Button
          type="button"
          variant="outline"
          className="h-10 self-start px-4"
          onClick={() => {
            setEditing(true);
          }}
        >
          <BellPlus aria-hidden />
          Set follow-up
        </Button>
        {dialog}
      </>
    ) : null;
  }

  const overdue = isPast(at);
  return (
    <section
      aria-label="Follow-up"
      className="bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <BellRing
          aria-hidden
          className={cn(
            "mt-0.5 size-5 shrink-0",
            overdue ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className={cn("text-sm font-medium", overdue && "text-destructive")}>
            {overdue ? "Follow-up overdue · " : "Follow up "}
            {formatNearDateTime(at)}
          </p>
          {note ? (
            <p className="text-muted-foreground text-sm wrap-anywhere whitespace-pre-wrap">
              {note}
            </p>
          ) : null}
        </div>
      </div>
      {canSet || canClear ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {canSet ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              onClick={() => {
                setEditing(true);
              }}
            >
              Change
            </Button>
          ) : null}
          {canClear ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              disabled={clearing}
              onClick={() => void clear()}
            >
              {clearing ? "Clearing..." : "Clear"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
