"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchHealth, selectHealth } from "./health.slice";

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
        <p role="alert" className="text-destructive text-sm">
          {error.code}: {error.message}
        </p>
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
