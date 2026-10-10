"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";
import { PageLoading } from "./page-state";
import { SelectControl } from "./select-control";

// The two dialogs every owned record has (a lead, a contact, a company). The feature says
// what the record is called and hands over the request; the dialog does the rest: the form,
// the error in the dialog, the toast.

// What the dialogs need to know about a record.
type OwnedRecord = { name: string; owner: { id: string; name: string } };

const reassignSchema = z.object({ ownerId: z.string().min(1, "Choose an owner.") });

type ReassignValues = z.infer<typeof reassignSchema>;

// Gives a record to another owner. Admin and Sales Manager only; the choices are the people
// the signed-in user may assign records to.
//
//   <ReassignRecordDialog record={lead} noun="lead" onClose={onClose}
//     onReassign={(ownerId) => dispatch(assignLead({ id: lead.id, ownerId })).unwrap()} />
export function ReassignRecordDialog({
  record,
  noun,
  onReassign,
  onClose,
}: {
  record: OwnedRecord;
  // What the record is called in a sentence: "lead", "contact", "company".
  noun: string;
  // Sends the request and resolves with the record as it is now. A rejection (an ApiError)
  // is shown in the dialog, which stays open.
  onReassign: (ownerId: string) => Promise<{ owner: { name: string } }>;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { data: owners, error: ownersError } = useAppSelector(selectAssignableUsers);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ReassignValues>({
    resolver: zodResolver(reassignSchema),
    defaultValues: { ownerId: "" },
  });

  useEffect(() => {
    void dispatch(fetchAssignableUsers());
  }, [dispatch]);

  // The current owner is not a choice: picking them would change nothing.
  const options = (owners ?? [])
    .filter((owner) => owner.id !== record.owner.id)
    .map((owner) => ({ value: owner.id, label: owner.name }));

  async function onSubmit(values: ReassignValues) {
    setFormError(null);
    try {
      const updated = await onReassign(values.ownerId);
      toast.success(`${record.name} was reassigned to ${updated.owner.name}.`);
      onClose();
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["ownerId"]));
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
            <DialogTitle className="pr-8 wrap-anywhere">Reassign {record.name}</DialogTitle>
            <DialogDescription className="wrap-anywhere">
              The {noun} is owned by {record.owner.name}. Choose who takes it over.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError ?? (ownersError ? describeApiError(ownersError) : null)} />
          {owners === null && !ownersError ? (
            <PageLoading label="Loading owners..." />
          ) : (
            <FormField
              control={form.control}
              name="ownerId"
              label="New owner"
              description={
                owners !== null && options.length === 0
                  ? `There is nobody else you can assign this ${noun} to.`
                  : undefined
              }
            >
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
                  options={options}
                  placeholder="Select an owner"
                />
              )}
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-10 px-4"
              disabled={form.formState.isSubmitting || options.length === 0}
            >
              {form.formState.isSubmitting ? "Reassigning..." : "Reassign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Asks before deleting a record. `onDeleted` lets a record page leave the deleted record.
//
//   <DeleteRecordDialog name={lead.name} onClose={onClose} onDeleted={onDeleted}
//     description="The lead and its notes are removed for everyone. This cannot be undone."
//     onDelete={() => dispatch(deleteLead(lead.id)).unwrap()} />
export function DeleteRecordDialog({
  name,
  description,
  onDelete,
  onClose,
  onDeleted,
}: {
  name: string;
  // What is lost, and what is kept: the sentence under the question.
  description: ReactNode;
  // Sends the request. A rejection (an ApiError) is shown in the dialog, which stays open.
  onDelete: () => Promise<unknown>;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      await onDelete();
      toast.success(`${name} was deleted.`);
      onClose();
      onDeleted?.();
    } catch (caught) {
      // FORBIDDEN, NOT_FOUND and the rest are explained in the dialog, which stays open.
      setError(describeApiError(caught as ApiError));
      setWorking(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !working) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10 px-4" disabled={working}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-10 px-4"
            disabled={working}
            onClick={(event) => {
              // Keep the dialog open until the request has answered.
              event.preventDefault();
              void confirm();
            }}
          >
            {working ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
