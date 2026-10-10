"use client";

import { type ReactNode, useEffect } from "react";

import { RecordLoader } from "@/components/shared/record-loader";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchOpportunity, selectCurrentOpportunity } from "./opportunities.slice";
import type { Opportunity } from "./opportunities.types";

// Loads one opportunity for the detail and edit pages and renders `children` with it.
// Loading, "not found" and a failed load are drawn by the shared RecordLoader.
export function OpportunityLoader({
  id,
  children,
}: {
  id: string;
  children: (opportunity: Opportunity) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectCurrentOpportunity);

  useEffect(() => {
    void dispatch(fetchOpportunity(id));
  }, [dispatch, id]);

  return (
    <RecordLoader
      id={id}
      current={current}
      noun="opportunity"
      backHref="/opportunities"
      backLabel="Back to opportunities"
      onRetry={() => void dispatch(fetchOpportunity(id))}
    >
      {children}
    </RecordLoader>
  );
}
