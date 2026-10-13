"use client";

import { PrintDocumentPage } from "@/components/shared/print-document";

import { getInvoiceDocument } from "./invoices.api";

// /invoices/[id]/print: the invoice as a page for the browser's print dialog ("Save as PDF").
export function InvoicePrintPage({ id }: { id: string }) {
  return (
    <PrintDocumentPage
      id={id}
      load={getInvoiceDocument}
      backHref={`/invoices/${id}`}
      backLabel="Back to invoice"
    />
  );
}
