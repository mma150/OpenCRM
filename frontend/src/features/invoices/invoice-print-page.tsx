"use client";

import { PrintDocumentPage } from "@/components/shared/print-document";

import { downloadInvoicePdf, getInvoiceDocument } from "./invoices.api";

// /invoices/[id]/print: the invoice as a page for the browser's print dialog, with "Download PDF" for
// the API's PDF file.
export function InvoicePrintPage({ id }: { id: string }) {
  return (
    <PrintDocumentPage
      id={id}
      load={getInvoiceDocument}
      downloadPdf={downloadInvoicePdf}
      backHref={`/invoices/${id}`}
      backLabel="Back to invoice"
    />
  );
}
