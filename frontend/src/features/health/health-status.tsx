"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchHealth, selectHealth } from "./health.slice";

// The message is chosen by the error code, never by parsing the server's text (D-12).
// Known codes get a fixed client string; any other code shows the code and server message.
function describeError(error: ApiError): string {
  switch (error.code) {
    case "SERVICE_UNAVAILABLE":
      return "The API is running but the database is unavailable";
    case "NETWORK_ERROR":
      return "The API cannot be reached";
    default:
      return `${error.code}: ${error.message}`;
  }
}

export function HealthStatus() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectHealth);

  useEffect(() => {
    void dispatch(fetchHealth());
  }, [dispatch]);

  // Values are rendered as React text nodes only (T-03-01).
  return (
    <section
      data-testid="health-status"
      className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-4 shadow-sm sm:p-6"
    >
      <h1 className="text-2xl font-semibold tracking-tight">OpenCRM</h1>
      {status === "failed" && error ? (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="text-destructive">{describeError(error)}</p>
          {error.requestId ? (
            <p className="text-muted-foreground text-xs">Request id: {error.requestId}</p>
          ) : null}
        </div>
      ) : data ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">API status</dt>
          <dd className="font-medium">{data.status}</dd>
          <dt className="text-muted-foreground">Database server time</dt>
          <dd className="font-medium">{data.database.serverTime}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">Loading status...</p>
      )}
      <Button
        type="button"
        size="lg"
        className="self-start"
        onClick={() => void dispatch(fetchHealth())}
      >
        Refresh
      </Button>
    </section>
  );
}
