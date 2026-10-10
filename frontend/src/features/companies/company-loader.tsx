"use client";

import { type ReactNode, useEffect } from "react";

import { RecordLoader } from "@/components/shared/record-loader";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchCompany, selectCurrentCompany } from "./companies.slice";
import type { Company } from "./companies.types";

// Loads one company for the detail and edit pages and renders `children` with it. Loading,
// "not found" and a failed load are drawn by the shared RecordLoader.
export function CompanyLoader({
  id,
  children,
}: {
  id: string;
  children: (company: Company) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectCurrentCompany);

  useEffect(() => {
    void dispatch(fetchCompany(id));
  }, [dispatch, id]);

  return (
    <RecordLoader
      id={id}
      current={current}
      noun="company"
      backHref="/companies"
      backLabel="Back to companies"
      onRetry={() => void dispatch(fetchCompany(id))}
    >
      {children}
    </RecordLoader>
  );
}
