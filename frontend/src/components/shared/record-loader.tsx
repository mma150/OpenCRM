import { SearchX, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/http";

import { PageError, PageLoading, PageState } from "./page-state";

// What a feature's loader component hands over: the `current` part of its slice.
type CurrentRecord<Item> = {
  id: string | null;
  data: Item | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

// The states of a record page or an edit page while its record is on the way: loading,
// "not found", a failed load with Retry, and then `children` with the record. A feature
// wraps it in its own loader, which dispatches the request (see `lead-loader.tsx`).
// A record that does not exist and one this user may not see get the same "not found"
// page: the API does not say which of the two it is.
export function RecordLoader<Item>({
  id,
  current,
  noun,
  backHref,
  backLabel,
  onRetry,
  children,
}: {
  id: string;
  current: CurrentRecord<Item>;
  // What the record is called in a sentence: "lead", "contact", "company".
  noun: string;
  // The list to go back to from "not found": "/leads" and "Back to leads".
  backHref: string;
  backLabel: string;
  onRetry: () => void;
  children: (record: Item) => ReactNode;
}) {
  // The store may still hold the record that was open before this one.
  if (current.id === id && current.data) {
    return children(current.data);
  }

  if (current.id === id && current.status === "failed" && current.error) {
    // An id that is not a valid id at all is refused as VALIDATION_FAILED: also "not found".
    if (current.error.code === "NOT_FOUND" || current.error.code === "VALIDATION_FAILED") {
      return (
        <PageState
          icon={SearchX}
          title={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} not found`}
          description={`This ${noun} does not exist, was deleted, or belongs to someone outside your team.`}
          action={
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          }
        />
      );
    }
    return <PageError error={current.error} onRetry={onRetry} />;
  }

  return <PageLoading label={`Loading ${noun}...`} />;
}

// What a Read-only user gets instead of a form: they see records but change nothing. This
// is for clarity only: the API refuses them too (FORBIDDEN).
export function NoWriteAccess({
  plural,
  backHref,
}: {
  // The records in a sentence: "leads", "contacts", "companies".
  plural: string;
  backHref: string;
}) {
  return (
    <PageState
      icon={ShieldAlert}
      title={`You cannot change ${plural}`}
      description={`Your role is Read-only. Ask an Admin if you need to add or edit ${plural}.`}
      action={
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href={backHref}>Back to {plural}</Link>
        </Button>
      }
    />
  );
}
