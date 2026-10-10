"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { DeleteRecordDialog, ReassignRecordDialog } from "@/components/shared/record-dialogs";
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
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { ConvertLeadDialog } from "./convert-lead-dialog";
import { LOST_REASONS, lostReasonOptions } from "./lead-labels";
import { assignLead, deleteLead, markLeadLost } from "./leads.slice";
import type { Lead } from "./leads.types";

// The dialog a lead's actions menu can open. The list page and the detail page both keep
// one of these in state and render <LeadDialogs>.
export type LeadDialog = {
  kind: "convert" | "mark-lost" | "reassign" | "delete";
  lead: Lead;
} | null;

const markLostSchema = z.object({
  // "" is the select before a choice is made.
  reason: z.enum(["", ...LOST_REASONS]).refine((value) => value.length > 0, "Choose a reason."),
  note: z.string().trim().max(1000, "Use 1000 characters or fewer."),
});

type MarkLostValues = z.infer<typeof markLostSchema>;

// Marks a lead as lost with a reason and an optional note (LEAD-05).
function MarkLostDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<MarkLostValues>({
    resolver: zodResolver(markLostSchema),
    defaultValues: { reason: "", note: "" },
  });

  async function onSubmit(values: MarkLostValues) {
    if (values.reason === "") {
      return;
    }
    setFormError(null);
    try {
      await dispatch(
        markLeadLost({
          id: lead.id,
          input: { reason: values.reason, ...(values.note ? { note: values.note } : {}) },
        }),
      ).unwrap();
      toast.success(`${lead.name} was marked as lost.`);
      onClose();
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["reason", "note"]));
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
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle className="pr-8 wrap-anywhere">Mark {lead.name} as lost</DialogTitle>
            <DialogDescription>
              Record why this lead did not go ahead. You can reopen it later.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          <FormField control={form.control} name="reason" label="Reason">
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
                options={lostReasonOptions}
                placeholder="Select a reason"
              />
            )}
          </FormField>
          <FormField control={form.control} name="note" label="Note (optional)">
            {(field) => <Textarea {...field} rows={3} className="min-h-24" />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="h-10 px-4"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : "Mark as lost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The dialogs of a lead. Convert and Mark as lost are the lead's own; Reassign (LEAD-02) and Delete are
// the shared record dialogs, given the lead's requests.
export function LeadDialogs({
  dialog,
  onClose,
  onDeleted,
}: {
  dialog: LeadDialog;
  onClose: () => void;
  // Lets the detail page leave the deleted lead.
  onDeleted?: () => void;
}) {
  const dispatch = useAppDispatch();
  if (!dialog) {
    return null;
  }
  const { lead } = dialog;

  switch (dialog.kind) {
    case "convert":
      return <ConvertLeadDialog lead={lead} onClose={onClose} />;
    case "mark-lost":
      return <MarkLostDialog lead={lead} onClose={onClose} />;
    case "reassign":
      return (
        <ReassignRecordDialog
          record={lead}
          noun="lead"
          onReassign={(ownerId) => dispatch(assignLead({ id: lead.id, ownerId })).unwrap()}
          onClose={onClose}
        />
      );
    case "delete":
      return (
        <DeleteRecordDialog
          name={lead.name}
          description="The lead and its notes are removed for everyone. This cannot be undone."
          onDelete={() => dispatch(deleteLead(lead.id)).unwrap()}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      );
  }
}
