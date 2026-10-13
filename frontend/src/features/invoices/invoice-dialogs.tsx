"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
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
import { formatDay, toDateTimeInputValue } from "@/lib/format";
import { useAppDispatch } from "@/store/hooks";

import { updateInvoice } from "./invoices.slice";
import type { Invoice, UpdateInvoiceInput } from "./invoices.types";
import { useInvoiceStatus } from "./use-invoice-status";

// The dialog an invoice's actions can open. The invoice page keeps one of these in state and
// renders <InvoiceDialogs>.
export type InvoiceDialog = { kind: "edit" | "paid" | "void"; invoice: Invoice } | null;

type DialogProps = { invoice: Invoice; onClose: () => void };

function closeOn(onClose: () => void) {
  return (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
}

type EditValues = { dueDate: string; notes: string };

// The only two things about an invoice that can be changed: when it is due, and its notes.
// The due date may not be before the issue date, which is checked here and by the API.
function EditInvoiceDialog({ invoice, onClose }: DialogProps) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      z.object({
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date.")
          .refine(
            (value) => value >= invoice.issueDate,
            `The due date cannot be before the issue date (${formatDay(invoice.issueDate)}).`,
          ),
        notes: z.string().trim().max(5000, "Use 5000 characters or fewer."),
      }),
    [invoice.issueDate],
  );
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: { dueDate: invoice.dueDate, notes: invoice.notes ?? "" },
  });

  async function onSubmit(values: EditValues) {
    setFormError(null);
    // Only what changed is sent; notes that were emptied are sent as null.
    const changes: UpdateInvoiceInput = {
      ...(values.dueDate === invoice.dueDate ? {} : { dueDate: values.dueDate }),
      ...(values.notes === (invoice.notes ?? "") ? {} : { notes: values.notes || null }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    try {
      await dispatch(updateInvoice({ id: invoice.id, changes })).unwrap();
      toast.success(`${invoice.number} was saved.`);
      onClose();
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["dueDate", "notes"]));
    }
  }

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 wrap-anywhere">Edit {invoice.number}</DialogTitle>
          <DialogDescription>
            The due date and the notes can be changed. The lines, the totals and the buyer are a
            copy of the quote and stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Edit invoice"
          className="grid grid-cols-1 gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormAlert message={formError} />
          <FormField
            control={form.control}
            name="dueDate"
            label="Due date"
            description={`Issued ${formatDay(invoice.issueDate)}.`}
          >
            {(field) => <Input {...field} type="date" min={invoice.issueDate} className="h-10" />}
          </FormField>
          <FormField control={form.control} name="notes" label="Notes">
            {(field) => <Textarea {...field} rows={4} className="max-h-60 min-h-28" />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const paidSchema = z.object({
  // A `datetime-local` value in the viewer's time zone, or "" for "now".
  paidAt: z
    .string()
    .refine(
      (value) => value === "" || !Number.isNaN(new Date(value).getTime()),
      "Enter a valid date and time.",
    )
    .refine(
      (value) => value === "" || new Date(value).getTime() <= Date.now(),
      "A payment cannot be in the future.",
    ),
});

type PaidValues = z.infer<typeof paidSchema>;

// Marks an invoice as paid, with the moment the money came in when it was not just now.
function MarkPaidDialog({ invoice, onClose }: DialogProps) {
  const changeStatus = useInvoiceStatus();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PaidValues>({
    resolver: zodResolver(paidSchema),
    defaultValues: { paidAt: "" },
  });

  async function onSubmit(values: PaidValues) {
    setFormError(null);
    // The input holds local time; the API takes the exact moment.
    const paidAt = values.paidAt ? new Date(values.paidAt).toISOString() : undefined;
    const error = await changeStatus(invoice, "mark-paid", paidAt);
    if (error) {
      setFormError(applyServerError(error, form.setError, ["paidAt"]));
      return;
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 wrap-anywhere">Mark {invoice.number} as paid</DialogTitle>
          <DialogDescription>
            This only records the payment: OpenCRM takes no money. You can mark the invoice unpaid
            again later.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Mark as paid"
          className="grid grid-cols-1 gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormAlert message={formError} />
          <FormField
            control={form.control}
            name="paidAt"
            label="Paid on (optional)"
            description="Leave empty when it was paid just now."
          >
            {(field) => (
              <Input
                {...field}
                type="datetime-local"
                max={toDateTimeInputValue(new Date())}
                className="h-10"
              />
            )}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Mark paid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Asks before an invoice is voided, and says what a void invoice still holds on to.
function VoidInvoiceDialog({ invoice, onClose }: DialogProps) {
  const changeStatus = useInvoiceStatus();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function voidInvoice() {
    setFormError(null);
    setSaving(true);
    const error = await changeStatus(invoice, "void");
    if (error) {
      setSaving(false);
      setFormError(describeApiError(error));
      return;
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 wrap-anywhere">Void {invoice.number}?</DialogTitle>
          <DialogDescription>
            A void invoice no longer counts as outstanding or paid. It keeps its number, and its
            quote {invoice.quote.number} still cannot be reopened or invoiced again. You can restore
            the invoice later; it then becomes a draft.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={formError} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 px-4"
            disabled={saving}
            onClick={() => void voidInvoice()}
          >
            {saving ? "Voiding..." : "Void invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The dialogs of an invoice: edit the due date and notes, mark paid, and void.
export function InvoiceDialogs({
  dialog,
  onClose,
}: {
  dialog: InvoiceDialog;
  onClose: () => void;
}) {
  if (!dialog) {
    return null;
  }
  const { invoice } = dialog;

  switch (dialog.kind) {
    case "edit":
      return <EditInvoiceDialog invoice={invoice} onClose={onClose} />;
    case "paid":
      return <MarkPaidDialog invoice={invoice} onClose={onClose} />;
    case "void":
      return <VoidInvoiceDialog invoice={invoice} onClose={onClose} />;
  }
}
