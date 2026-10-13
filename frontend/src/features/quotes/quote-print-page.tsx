"use client";

import { PrintDocumentPage } from "@/components/shared/print-document";

import { getQuoteDocument } from "./quotes.api";

// /quotes/[id]/print: the quote as a page for the browser's print dialog ("Save as PDF").
export function QuotePrintPage({ id }: { id: string }) {
  return (
    <PrintDocumentPage
      id={id}
      load={getQuoteDocument}
      backHref={`/quotes/${id}`}
      backLabel="Back to quote"
    />
  );
}
