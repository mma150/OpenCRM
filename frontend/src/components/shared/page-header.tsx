import type { ReactNode } from "react";

// The title block at the top of every page: the h1, one line of help, and the page's main action.
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-col sm:flex-row">{action}</div> : null}
    </header>
  );
}
