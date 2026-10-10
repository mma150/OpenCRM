"use client";

import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useRef, useState } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { csvBlob, saveFile } from "@/lib/save-file";
import { cn } from "@/lib/utils";

import {
  formatFileSize,
  IMPORT_TYPE_WORDS,
  importTemplate,
  importTypeOptions,
  MAX_FILE_BYTES,
  MAX_FILE_ROWS,
} from "./import-labels";
import { previewImport } from "./imports.api";
import type { ImportField, ImportPreview, ImportType } from "./imports.types";

// The file the user chose, read in the browser: the API is sent its text, not the file.
export type ChosenFile = { name: string; size: number; csv: string };

// What the API said about the file itself: its VALIDATION_FAILED details on `csv` (an empty
// file, a column without a name, more than 5,000 rows), in the API's own words. Null when
// the error is about something else.
export function fileProblem(error: ApiError): string | null {
  if (error.code === "PAYLOAD_TOO_LARGE") {
    return describeApiError(error);
  }
  if (error.code !== "VALIDATION_FAILED" || !Array.isArray(error.details)) {
    return null;
  }
  const messages = (error.details as unknown[]).flatMap((detail) =>
    typeof detail === "object" &&
    detail !== null &&
    "path" in detail &&
    detail.path === "csv" &&
    "message" in detail &&
    typeof detail.message === "string"
      ? [detail.message]
      : [],
  );
  return messages.length > 0 ? messages.join(" ") : null;
}

// Step 1 of an import: what to import and from which file. The file is checked here for
// what the browser can know (its name and its size) and then sent to the API, which reads
// its columns and first rows without saving anything.
export function ImportFileStep({
  type,
  onTypeChange,
  fields,
  problem,
  onPreviewed,
}: {
  type: ImportType;
  onTypeChange: (type: ImportType) => void;
  // The fields of this record type, for the template; null until they are loaded.
  fields: ImportField[] | null;
  // What a later step found wrong with the file, to show when the user is sent back here.
  problem: string | null;
  onPreviewed: (file: ChosenFile, preview: ImportPreview) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [error, setError] = useState<string | null>(problem);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const words = IMPORT_TYPE_WORDS[type];

  async function choose(chosen: File | undefined) {
    if (!chosen) {
      return;
    }
    setFile(null);
    if (!chosen.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file. Save a spreadsheet as CSV (comma-separated) first.");
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setError("The file is larger than 5 MB. Split it into smaller files and import each one.");
      return;
    }
    if (chosen.size === 0) {
      setError("The file is empty.");
      return;
    }
    try {
      const csv = await chosen.text();
      setError(null);
      setFile({ name: chosen.name, size: chosen.size, csv });
    } catch {
      setError("The file could not be read. Choose it again.");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files[0]);
  }

  async function preview() {
    if (!file || reading) {
      return;
    }
    setError(null);
    setReading(true);
    try {
      onPreviewed(file, await previewImport(type, file.csv));
    } catch (caught) {
      // The axios interceptor already turned every failure into an ApiError.
      const apiError = caught as ApiError;
      setError(fileProblem(apiError) ?? describeApiError(apiError));
      setReading(false);
    }
  }

  return (
    <>
      <SegmentedControl
        label="What to import"
        className="sm:self-start"
        value={type}
        options={importTypeOptions}
        onChange={(next) => {
          setFile(null);
          setError(null);
          onTypeChange(next);
        }}
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <FormAlert message={error} />

          {file ? (
            <div className="flex min-w-0 items-center gap-3 rounded-lg border p-4">
              <FileSpreadsheet aria-hidden className="text-muted-foreground size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium wrap-anywhere">{file.name}</p>
                <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="size-10 shrink-0"
                aria-label={`Remove ${file.name}`}
                disabled={reading}
                onClick={() => {
                  setFile(null);
                }}
              >
                <X aria-hidden />
              </Button>
            </div>
          ) : (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => {
                setDragging(false);
              }}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center sm:p-10",
                dragging && "border-primary bg-primary/5",
              )}
            >
              <Upload aria-hidden className="text-muted-foreground size-8" />
              <p className="text-sm">
                <span className="max-sm:hidden">Drag a CSV file here, or choose one.</span>
                <span className="sm:hidden">Choose a CSV file from this device.</span>
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                onClick={() => input.current?.click()}
              >
                Choose a file
              </Button>
            </div>
          )}
          {/* Always in the page, so the button above and a test can reach it. */}
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            className="sr-only"
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              // The same file can then be chosen again after it was corrected.
              event.target.value = "";
            }}
          />

          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <h2 className="font-medium">What the file must look like</h2>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Comma-separated values (.csv), saved as UTF-8.</li>
              <li>
                The first row holds the column names; every row after it is one {words.singular}.
              </li>
              <li>Dates are written as YYYY-MM-DD (2026-11-15) and numbers as 1200.50.</li>
              {type === "CONTACT" ? (
                <li>A company column links each contact to the company with that name.</li>
              ) : null}
              <li>
                At most 5 MB and {MAX_FILE_ROWS.toLocaleString("en-US")} rows. Split a longer file.
              </li>
            </ul>
            <Button
              type="button"
              variant="link"
              className="h-10 self-start px-0"
              disabled={fields === null}
              onClick={() => {
                if (fields) {
                  saveFile(csvBlob(importTemplate(fields)), `${words.plural}-import-template.csv`);
                }
              }}
            >
              <Download aria-hidden />
              Download template
            </Button>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={`/${words.plural}`}>Cancel</Link>
            </Button>
            <Button
              type="button"
              className="h-10 px-4"
              disabled={!file || reading}
              onClick={() => void preview()}
            >
              {reading ? <Spinner /> : null}
              {reading ? "Reading the file..." : "Continue"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
