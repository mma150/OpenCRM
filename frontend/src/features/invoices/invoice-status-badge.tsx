import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { INVOICE_STATUS_LABELS } from "./invoice-labels";
import type { InvoiceStatus } from "./invoices.types";

// A status is never shown by colour alone: the badge always carries the word, "Overdue"
// included.
const STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  SENT: "border-primary/30 bg-primary/10 text-primary",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  OVERDUE: "border-destructive/30 bg-destructive/10 text-destructive",
  VOID: "border-border bg-transparent text-muted-foreground",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", STYLES[status])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {INVOICE_STATUS_LABELS[status]}
    </Badge>
  );
}
