import { Badge } from "@/components/ui/badge";
import { type Role, ROLE_LABELS, STATUS_LABELS, type UserStatus } from "@/lib/user-labels";
import { cn } from "@/lib/utils";

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant="outline">{ROLE_LABELS[role]}</Badge>;
}

// A status is never shown by colour alone: the badge always carries the word.
const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  INVITED:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  DEACTIVATED: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
