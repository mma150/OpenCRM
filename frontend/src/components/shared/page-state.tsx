import { CircleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";

// One look for every "there is nothing to show here" moment: empty, no access, not found.
export function PageState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Empty className="border py-10">
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon aria-hidden />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function PageLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
      <Spinner />
      {label}
    </div>
  );
}

// A failed load: what went wrong in words, the request id for the API log, and a way to retry.
export function PageError({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert">
      <PageState
        icon={CircleAlert}
        title="Something went wrong"
        description={
          <>
            {describeApiError(error)}
            {error.requestId ? (
              <span className="mt-1 block text-xs wrap-anywhere">
                Request id: {error.requestId}
              </span>
            ) : null}
          </>
        }
        action={
          onRetry ? (
            <Button type="button" variant="outline" size="lg" onClick={onRetry}>
              Retry
            </Button>
          ) : null
        }
      />
    </div>
  );
}
