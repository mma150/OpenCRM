"use client";

import { PrintDocumentPage } from "@/components/shared/print-document";

import { downloadQuotePdf, getQuoteDocument } from "./quotes.api";

// /quotes/[id]/print: the quote as a page for the browser's print dialog, with "Download PDF" for
// the API's PDF file.
export function QuotePrintPage({ id }: { id: string }) {
  return (
    <PrintDocumentPage
      id={id}
      load={getQuoteDocument}
      downloadPdf={downloadQuotePdf}
      backHref={`/quotes/${id}`}
      backLabel="Back to quote"
    />
  );
}
