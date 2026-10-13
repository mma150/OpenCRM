"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch } from "@/store/hooks";

import { INVOICE_ACTION_DONE } from "./invoice-labels";
import { changeInvoiceStatus, fetchInvoice } from "./invoices.slice";
import type { Invoice, InvoiceAction } from "./invoices.types";

// Changes an invoice's status, for the buttons and the dialogs of its page alike.
//
// It answers `null` when there is nothing left for the caller to show:
//   - the change was made (a toast says so), or
//   - the API refused it as INVALID_STATUS_CHANGE: someone changed the invoice in the
//     meantime, so a toast says that and the invoice is loaded again, and the page then
//     shows the status it really has.
// Any other failure is answered as the ApiError, for the caller to show where it belongs.
export function useInvoiceStatus() {
  const dispatch = useAppDispatch();

  return useCallback(
    async (invoice: Invoice, action: InvoiceAction, paidAt?: string): Promise<ApiError | null> => {
      try {
        await dispatch(
          changeInvoiceStatus({ id: invoice.id, action, ...(paidAt ? { paidAt } : {}) }),
        ).unwrap();
        toast.success(`${invoice.number} ${INVOICE_ACTION_DONE[action]}`);
        return null;
      } catch (error) {
        // The thunk rejects with the ApiError the axios interceptor made.
        const apiError = error as ApiError;
        if (apiError.code === "INVALID_STATUS_CHANGE") {
          toast.error(describeApiError(apiError));
          void dispatch(fetchInvoice(invoice.id));
          return null;
        }
        return apiError;
      }
    },
    [dispatch],
  );
}
