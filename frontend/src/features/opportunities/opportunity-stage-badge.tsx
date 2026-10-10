import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { Opportunity, OpportunityStatus } from "./opportunities.types";

// The colour follows the kind of the stage; the badge always carries the stage's name, so a
// stage is never shown by colour alone.
const STYLES: Record<OpportunityStatus, string> = {
  OPEN: "border-primary/30 bg-primary/10 text-primary",
  WON: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  LOST: "border-destructive/30 bg-destructive/10 text-destructive",
};

// The stage an opportunity is in: "Proposal", "Won", "Lost".
export function OpportunityStageBadge({ stage }: { stage: Opportunity["stage"] }) {
  return (
    <Badge variant="outline" className={cn("max-w-full min-w-0 shrink", STYLES[stage.kind])}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{stage.name}</span>
    </Badge>
  );
}
