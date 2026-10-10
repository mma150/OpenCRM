import type { SelectOption } from "@/components/shared/select-control";
import { STAGE_KIND_LABELS, STAGE_KINDS } from "@/features/pipeline-stages/stage-labels";
import { recordAccess } from "@/lib/record-access";

import type { CloseOutcome, OpportunityStatus } from "./opportunities.types";

// The words for an opportunity's status. Never print the raw enum value.
export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = STAGE_KIND_LABELS;
export const OPPORTUNITY_STATUSES: OpportunityStatus[] = STAGE_KINDS;

export const opportunityStatusOptions: SelectOption[] = OPPORTUNITY_STATUSES.map((status) => ({
  value: status,
  label: OPPORTUNITY_STATUS_LABELS[status],
}));

// "Close as won", "Closed as lost".
export const OUTCOME_WORDS: Record<CloseOutcome, string> = { WON: "won", LOST: "lost" };

// What a role may do with the opportunities it can see: the rule every owned record shares.
export const opportunityAccess = recordAccess;
