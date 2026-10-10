// Hands a file to the browser's download folder: an export, the failed rows of an import,
// an import template. The file never leaves the page until the user's browser saves it.
// How long the file stays reachable after the click that saves it.
const REVOKE_AFTER_MS = 60_000;

export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Not at once: a browser that has not started reading the file yet would cancel the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_AFTER_MS);
}

// CSV text as a file. The text is saved as it is: a file the API wrote already starts with
// the byte order mark Excel needs.
export function csvBlob(text: string): Blob {
  return new Blob([text], { type: "text/csv;charset=utf-8" });
}
