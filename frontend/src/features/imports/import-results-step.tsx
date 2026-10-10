"use client";

import { ArrowRight, CircleCheck, Download, Upload } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { csvBlob, saveFile } from "@/lib/save-file";
import { cn } from "@/lib/utils";

import { IMPORT_TYPE_WORDS } from "./import-labels";
import type { ImportResult, ImportRowError, ImportType } from "./imports.types";

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "failed";
}) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-1 rounded-lg border p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "failed" && value > 0 && "text-destructive",
        )}
      >
        {value.toLocaleString("en-US")}
      </dd>
      <dd className="text-muted-foreground text-xs">{hint}</dd>
    </div>
  );
}

// One row that was not imported: its number in the spreadsheet (the header is row 1), why,
// and what it held.
function FailedRow({ error }: { error: ImportRowError }) {
  const values = Object.entries(error.values).filter(([, cell]) => cell !== "");
  return (
    <li className="grid min-w-0 grid-cols-1 gap-2 p-3 sm:px-4 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
      <p className="text-sm font-medium">Row {String(error.row)}</p>
      <ul className="flex min-w-0 flex-col gap-1">
        {error.messages.map((message, index) => (
          <li
            // Messages have no id, and their order does not change.
            key={`${String(index)}-${message.message}`}
            className="text-destructive text-sm wrap-anywhere"
          >
            {message.field ? <span className="font-medium">{message.field}: </span> : null}
            {message.message}
          </li>
        ))}
      </ul>
      <dl className="text-muted-foreground flex min-w-0 flex-col gap-0.5 text-xs">
        {values.length === 0 ? <dd>The row is empty.</dd> : null}
        {values.map(([header, cell]) => (
          <div key={header} className="flex min-w-0 flex-wrap gap-x-1.5">
            <dt className="font-medium">{header}:</dt>
            <dd className="text-foreground min-w-0 wrap-anywhere">{cell}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

// Step 3 of an import: what was created, skipped and refused, the refused rows with their
// reasons, and the file of those rows to correct and import again.
export function ImportResultsStep({
  type,
  fileName,
  result,
  onAnother,
}: {
  type: ImportType;
  fileName: string;
  result: ImportResult;
  onAnother: () => void;
}) {
  const words = IMPORT_TYPE_WORDS[type];
  const failedCsv = result.failedCsv;
  const downloadFailed = failedCsv
    ? () => {
        // The API wrote the file; it is saved exactly as it came.
        saveFile(csvBlob(failedCsv), `${fileName.replace(/\.csv$/i, "")}-failed-rows.csv`);
      }
    : null;

  return (
    <>
      <div
        role="status"
        className="flex min-w-0 items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950"
      >
        <CircleCheck
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"
        />
        <p className="min-w-0 text-sm wrap-anywhere">
          <span className="font-medium">The import is finished.</span>{" "}
          {result.created.toLocaleString("en-US")} of {result.total.toLocaleString("en-US")} rows of{" "}
          {fileName} were imported into your {words.plural}.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Created" value={result.created} hint={`New ${words.plural}`} />
        <Tile
          label="Skipped"
          value={result.skipped}
          hint={`The ${words.duplicateBy} already exists`}
        />
        <Tile label="Failed" value={result.failed} hint="Rows that were refused" tone="failed" />
        {type === "CONTACT" ? (
          <Tile
            label="Companies created"
            value={result.companiesCreated}
            hint="For contacts whose company was new"
          />
        ) : null}
      </dl>

      {result.failed > 0 ? (
        <Card>
          <CardContent className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Rows that failed</h2>
                <p className="text-muted-foreground text-sm">
                  Nothing was saved for these rows. Download them, correct them and import the file
                  again. Row numbers are those of your spreadsheet (the column names are row 1).
                </p>
              </div>
              {downloadFailed ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 px-4"
                  onClick={downloadFailed}
                >
                  <Download aria-hidden />
                  Download failed rows
                </Button>
              ) : null}
            </div>
            <ul
              aria-label="Rows that failed"
              className="flex min-w-0 flex-col divide-y rounded-lg border"
            >
              {result.errors.map((error) => (
                <FailedRow key={error.row} error={error} />
              ))}
            </ul>
            {result.errorsTruncated ? (
              <p className="text-muted-foreground text-sm">
                Only the first {String(result.errors.length)} of{" "}
                {result.failed.toLocaleString("en-US")} failed rows are listed. The downloaded file
                holds all of them.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" className="h-10 px-4" onClick={onAnother}>
          <Upload aria-hidden />
          Import another file
        </Button>
        <Button asChild className="h-10 px-4">
          <Link href={`/${words.plural}`}>
            View {words.plural}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </>
  );
}
