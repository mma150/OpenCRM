"use client";

import { useEffect } from "react";

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
    <section data-testid="health-status">
      <h1>OpenCRM</h1>
      {status === "failed" && error ? (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      ) : data ? (
        <dl>
          <dt>API status</dt>
          <dd>{data.status}</dd>
          <dt>Database server time</dt>
          <dd>{data.database.serverTime}</dd>
        </dl>
      ) : (
        <p>Loading status...</p>
      )}
      <button type="button" onClick={() => void dispatch(fetchHealth())}>
        Refresh
      </button>
    </section>
  );
}
