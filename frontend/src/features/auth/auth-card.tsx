import type { ReactNode } from "react";

// The card every signed-out page shows: a title, one line of help, the form, and a footer link.
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="bg-card text-card-foreground flex flex-col gap-5 rounded-lg border p-6 shadow-xs">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="text-muted-foreground text-center text-sm">{footer}</div> : null}
    </section>
  );
}

// Shared by the links under and inside the auth cards.
export const authLinkClass =
  "text-primary rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";
