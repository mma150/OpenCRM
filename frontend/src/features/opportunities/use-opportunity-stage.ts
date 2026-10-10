"use client";

import { toast } from "sonner";

import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch } from "@/store/hooks";

import { moveOpportunity, reopenOpportunity } from "./opportunities.slice";
import type { Opportunity } from "./opportunities.types";

// Moves an opportunity to another open stage, or reopens a closed one, straight away and
// without a dialog; the result is a toast. On the board a move shows at once and is undone
// if the API refuses it (see `moveOpportunity` in the slice), so the toast is then the only
// sign that it failed. Closing as won or lost needs a reason and has a dialog instead.
export function useOpportunityStage() {
  const dispatch = useAppDispatch();

  return {
    move: async (opportunity: Opportunity, stage: { id: string; name: string }) => {
      try {
        await dispatch(moveOpportunity({ id: opportunity.id, stageId: stage.id })).unwrap();
        toast.success(`${opportunity.name} moved to ${stage.name}.`);
      } catch (error) {
        toast.error(
          `${opportunity.name} could not be moved. ${describeApiError(error as ApiError)}`,
        );
      }
    },
    reopen: async (opportunity: Opportunity) => {
      try {
        const reopened = await dispatch(reopenOpportunity(opportunity.id)).unwrap();
        toast.success(`${opportunity.name} was reopened in ${reopened.stage.name}.`);
      } catch (error) {
        toast.error(describeApiError(error as ApiError));
      }
    },
  };
}
