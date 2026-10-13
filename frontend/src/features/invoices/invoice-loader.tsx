"use client";

import { type ReactNode, useEffect } from "react";

import { RecordLoader } from "@/components/shared/record-loader";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchInvoice, selectCurrentInvoice } from "./invoices.slice";
import type { Invoice } from "./invoices.types";

// Loads one invoice for its page and renders `children` with it. Loading, "not found" and a
// failed load are drawn by the shared RecordLoader.
export function InvoiceLoader({
  id,
  children,
}: {
  id: string;
  children: (invoice: Invoice) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectCurrentInvoice);

  useEffect(() => {
    void dispatch(fetchInvoice(id));
  }, [dispatch, id]);

  return (
    <RecordLoader
      id={id}
      current={current}
      noun="invoice"
      backHref="/invoices"
      backLabel="Back to invoices"
      onRetry={() => void dispatch(fetchInvoice(id))}
    >
      {children}
    </RecordLoader>
  );
}
