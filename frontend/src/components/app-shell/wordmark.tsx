import { Network } from "lucide-react";

import { cn } from "@/lib/utils";

// The "OpenCRM" name with its mark. `collapsed` keeps only the mark from `md` to `lg`,
// where the sidebar is icons only.
export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md"
      >
        <Network className="size-4" />
      </span>
      <span
        className={cn("text-base font-semibold tracking-tight", collapsed && "md:max-lg:sr-only")}
      >
        OpenCRM
      </span>
    </span>
  );
}
