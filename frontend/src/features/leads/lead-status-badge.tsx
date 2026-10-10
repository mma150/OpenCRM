import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { LEAD_STATUS_LABELS } from "./lead-labels";
import type { LeadStatus } from "./leads.types";

// A status is never shown by colour alone: the badge always carries the word.
const STYLES: Record<LeadStatus, string> = {
  NEW: "border-border bg-muted text-muted-foreground",
  CONTACTED:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  QUALIFIED: "border-primary/30 bg-primary/10 text-primary",
  CONVERTED:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  LOST: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", STYLES[status])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}
