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
      {/* On a phone the action fills the row; a second control (the list's "More actions"
          menu) keeps its own width beside it. */}
      {action ? (
        <div className="flex shrink-0 gap-2 max-sm:[&>a]:flex-1 max-sm:[&>button]:flex-1">
          {action}
        </div>
      ) : null}
    </header>
  );
}
