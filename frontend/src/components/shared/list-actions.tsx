"use client";

import { Download, Ellipsis, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { DownloadedFile } from "@/lib/api/download";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";

// The most rows one export holds: the API's limit.
const EXPORT_ROW_LIMIT = "10,000";

// What a list offers beside its "New" button: "Export CSV" for everyone who can see the
// list, and "Import" where the feature gives a link (never to a Read-only user). From `sm`
// they are two buttons; on a phone they sit in one "More actions" menu, so the header stays
// one row.
//
//   <PageHeader action={<><ListActions importHref="/import?type=leads"
//     onExport={() => exportLeads(query)} />{newLeadButton}</>} />
//
// `onExport` is the feature's API call with the list's own query, so the file holds exactly
// what the search, the filters and the sort order show.
export function ListActions({
  importHref,
  onExport,
}: {
  importHref?: string;
  onExport: () => Promise<DownloadedFile>;
}) {
  const [exporting, setExporting] = useState(false);

  async function exportList() {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const file = await onExport();
      saveFile(file.blob, file.filename);
      if (file.truncated) {
        toast.warning(
          `Only the first ${EXPORT_ROW_LIMIT} rows were exported. Narrow the list with a filter to get the rest.`,
        );
      } else {
        toast.success(`${file.filename} was downloaded.`);
      }
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      toast.error(`The export failed. ${describeApiError(error as ApiError)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="hidden gap-2 sm:flex">
        {importHref ? (
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href={importHref}>
              <Upload aria-hidden />
              Import
            </Link>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={exporting}
          onClick={() => void exportList()}
        >
          {exporting ? <Spinner /> : <Download aria-hidden />}
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>
      <div className="order-last sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="size-10"
              aria-label="More actions"
              disabled={exporting}
            >
              {exporting ? <Spinner /> : <Ellipsis aria-hidden />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {importHref ? (
              <DropdownMenuItem asChild>
                <Link href={importHref}>
                  <Upload aria-hidden />
                  Import
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => void exportList()}>
              <Download aria-hidden />
              Export CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
