"use client";

import { FileDown, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { DownloadedFile } from "@/lib/api/download";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";

// What every role may do with a quote or an invoice as a document: download the PDF the API
// draws (GET /quotes/:id/pdf, GET /invoices/:id/pdf), or open the print view. `download` is
// the feature's API call (`downloadQuotePdf`, `downloadInvoicePdf`); the file is fetched,
// not linked to, so a refusal shows as a toast with the API's reason, and its name comes from
// the API ("Q-0001.pdf").

export function useDocumentDownload(download: () => Promise<DownloadedFile>) {
  const [downloading, setDownloading] = useState(false);

  async function start() {
    if (downloading) {
      return;
    }
    setDownloading(true);
    try {
      const file = await download();
      saveFile(file.blob, file.filename);
      toast.success(`${file.filename} was downloaded.`);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      toast.error(`The PDF could not be downloaded. ${describeApiError(error as ApiError)}`);
    } finally {
      setDownloading(false);
    }
  }

  return { downloading, start };
}

// "Download PDF" and "Print" as two buttons, for the header of a quote or an invoice.
export function DocumentFileButtons({
  printHref,
  download,
}: {
  printHref: string;
  download: () => Promise<DownloadedFile>;
}) {
  const { downloading, start } = useDocumentDownload(download);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 px-4"
        disabled={downloading}
        onClick={() => void start()}
      >
        {downloading ? <Spinner /> : <FileDown aria-hidden />}
        Download PDF
      </Button>
      <Button asChild variant="outline" className="h-10 px-4">
        <Link href={printHref}>
          <Printer aria-hidden />
          Print
        </Link>
      </Button>
    </>
  );
}

// The same two as items of a list row's menu.
export function DocumentFileMenuItems({
  printHref,
  download,
}: {
  printHref: string;
  download: () => Promise<DownloadedFile>;
}) {
  const { start } = useDocumentDownload(download);
  return (
    <>
      <DropdownMenuItem onSelect={() => void start()}>
        <FileDown aria-hidden />
        Download PDF
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={printHref}>
          <Printer aria-hidden />
          Print
        </Link>
      </DropdownMenuItem>
    </>
  );
}
