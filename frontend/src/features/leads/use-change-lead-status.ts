"use client";

import { toast } from "sonner";

import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch } from "@/store/hooks";

import { LEAD_STATUS_LABELS } from "./lead-labels";
import { updateLead } from "./leads.slice";
import type { Lead, OpenLeadStatus } from "./leads.types";

// Sets a lead to New, Contacted or Qualified straight away, without a dialog, and reports
// the result as a toast. Doing this to a lost lead reopens it.
export function useChangeLeadStatus() {
  const dispatch = useAppDispatch();

  return async (lead: Lead, status: OpenLeadStatus) => {
    try {
      await dispatch(updateLead({ id: lead.id, changes: { status } })).unwrap();
      toast.success(
        lead.status === "LOST"
          ? `${lead.name} was reopened.`
          : `Status changed to ${LEAD_STATUS_LABELS[status]}.`,
      );
    } catch (error) {
      toast.error(describeApiError(error as ApiError));
    }
  };
}
