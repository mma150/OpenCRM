"use client";

import { type ReactNode, useEffect } from "react";

import { RecordLoader } from "@/components/shared/record-loader";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchLead, selectCurrentLead } from "./leads.slice";
import type { Lead } from "./leads.types";

// Loads one lead for the detail and edit pages and renders `children` with it. Loading,
// "not found" and a failed load are drawn by the shared RecordLoader.
export function LeadLoader({ id, children }: { id: string; children: (lead: Lead) => ReactNode }) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectCurrentLead);

  useEffect(() => {
    void dispatch(fetchLead(id));
  }, [dispatch, id]);

  return (
    <RecordLoader
      id={id}
      current={current}
      noun="lead"
      backHref="/leads"
      backLabel="Back to leads"
      onRetry={() => void dispatch(fetchLead(id))}
    >
      {children}
    </RecordLoader>
  );
}
