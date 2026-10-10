"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { DeleteRecordDialog, ReassignRecordDialog } from "@/components/shared/record-dialogs";
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

import { assignOpportunity, closeOpportunity, deleteOpportunity } from "./opportunities.slice";
import type { CloseOutcome, Opportunity } from "./opportunities.types";
import { OUTCOME_WORDS } from "./opportunity-labels";

// The dialog an opportunity's actions can open. The board, the list and the detail page each
// keep one of these in state and render <OpportunityDialogs>.
export type OpportunityDialog =
  | { kind: "close"; outcome: CloseOutcome; opportunity: Opportunity }
  | { kind: "reassign" | "delete"; opportunity: Opportunity }
  | null;

const tooLong = "Use 1000 characters or fewer.";
// Why it was won may be left empty; why it was lost may not.
const closeSchemas = {
  WON: z.object({ reason: z.string().trim().max(1000, tooLong) }),
  LOST: z.object({
    reason: z.string().trim().min(1, "Say why the opportunity was lost.").max(1000, tooLong),
  }),
};

type CloseValues = { reason: string };

// Closes an opportunity as won or lost, with the reason (OPP-04). It opens from the
// "Close as won" and "Close as lost" buttons and menu items, and when a card is dropped on
// the Won or Lost column of the board.
function CloseOpportunityDialog({
  opportunity,
  outcome,
  onClose,
}: {
  opportunity: Opportunity;
  outcome: CloseOutcome;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CloseValues>({
    resolver: zodResolver(closeSchemas[outcome]),
    defaultValues: { reason: "" },
  });
  const lost = outcome === "LOST";

  async function onSubmit(values: CloseValues) {
    setFormError(null);
    try {
      await dispatch(
        closeOpportunity({
          id: opportunity.id,
          input: { outcome, ...(values.reason ? { reason: values.reason } : {}) },
        }),
      ).unwrap();
      toast.success(`${opportunity.name} was closed as ${OUTCOME_WORDS[outcome]}.`);
      onClose();
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["reason"]));
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
            <DialogTitle className="pr-8 wrap-anywhere">
              Close {opportunity.name} as {OUTCOME_WORDS[outcome]}
            </DialogTitle>
            <DialogDescription>
              {lost
                ? "Record why this opportunity was not won. You can reopen it later."
                : "The opportunity moves to the Won stage. You can reopen it later."}
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          <FormField
            control={form.control}
            name="reason"
            label={lost ? "Reason" : "Reason (optional)"}
            description={lost ? undefined : "What made the difference, if you want to keep it."}
          >
            {(field) => <Textarea {...field} rows={4} className="min-h-28" />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={lost ? "destructive" : "default"}
              className="h-10 px-4"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : `Close as ${OUTCOME_WORDS[outcome]}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The dialogs of an opportunity. Closing is its own; Reassign and Delete are the shared
// record dialogs, given the opportunity's requests.
export function OpportunityDialogs({
  dialog,
  onClose,
  onDeleted,
}: {
  dialog: OpportunityDialog;
  onClose: () => void;
  // Lets the detail page leave the deleted opportunity.
  onDeleted?: () => void;
}) {
  const dispatch = useAppDispatch();
  if (!dialog) {
    return null;
  }
  const { opportunity } = dialog;

  switch (dialog.kind) {
    case "close":
      return (
        <CloseOpportunityDialog
          // A fresh form when the outcome changes while the dialog is open.
          key={dialog.outcome}
          opportunity={opportunity}
          outcome={dialog.outcome}
          onClose={onClose}
        />
      );
    case "reassign":
      return (
        <ReassignRecordDialog
          record={opportunity}
          noun="opportunity"
          onReassign={(ownerId) =>
            dispatch(assignOpportunity({ id: opportunity.id, ownerId })).unwrap()
          }
          onClose={onClose}
        />
      );
    case "delete":
      return (
        <DeleteRecordDialog
          name={opportunity.name}
          description="The opportunity and its timeline are removed for everyone. Its contact and company are kept. This cannot be undone."
          onDelete={() => dispatch(deleteOpportunity(opportunity.id)).unwrap()}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      );
  }
}
