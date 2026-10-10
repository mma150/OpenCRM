// A small CSV reader and writer (RFC 4180), so the import and the exports need no library.
//
// Reading accepts what spreadsheets write: fields in double quotes, a quote inside a quoted
// field written twice (""), commas and line breaks inside quotes, CRLF, LF or CR line ends,
// a UTF-8 byte order mark at the start, and a last line with or without a line end. Rows may
// have different numbers of cells; the caller decides what that means.

const BOM = "﻿";

// What a cell of a file being written can hold. null is an empty cell.
export type CsvValue = string | number | null;

// The file ended inside a quoted field: a quote was opened and never closed.
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

// Every row of the file, in order, each a list of cells. An empty line is a row with one
// empty cell, so the position of a row in the result is its row number in a spreadsheet.
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // Whether the row being read has anything in it yet, so a line end at the very end of the
  // file does not add an empty row.
  let started = false;

  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
    started = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (input[index + 1] === '"') {
        // Two quotes inside a quoted field are one quote.
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
      started = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
      started = true;
    } else if (char === "\n" || char === "\r") {
      // CRLF is one line end.
      if (char === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      endRow();
    } else {
      // A quote in the middle of an unquoted cell is kept as it is.
      cell += char;
      started = true;
    }
  }
  if (quoted) {
    throw new CsvError("A quoted cell is never closed");
  }
  if (started) {
    endRow();
  }
  return rows;
}

function writeCell(value: CsvValue): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  // Quoted when the cell holds a comma, a quote or a line break, or starts or ends with a
  // space (which some readers would otherwise trim).
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// The rows as CSV text: CRLF line ends, as the RFC says, and one after the last row.
export function writeCsv(rows: CsvValue[][]): string {
  return rows.map((row) => `${row.map((cell) => writeCell(cell)).join(",")}\r\n`).join("");
}

// Spreadsheet formula injection: Excel, LibreOffice and Google Sheets run a cell that starts
// with one of these characters as a formula, so text from the CRM (a lead called
// "=HYPERLINK(...)") could run on the machine of whoever opens an export. A leading
// apostrophe makes the spreadsheet treat the cell as text (OWASP "CSV injection").
const FORMULA_START = /^[=+\-@\t\r]/;

export function neutraliseFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

// The reverse, for reading a file back in: an export (or the failed rows of an import) can
// be imported again without every "+44 20 ..." phone number gaining an apostrophe.
export function restoreFormula(text: string): string {
  return text.startsWith("'") && FORMULA_START.test(text.slice(1)) ? text.slice(1) : text;
}

// A file for a person to open in a spreadsheet: every text cell is neutralised (a number
// stays a number, so -5 is still -5), and the file starts with a byte order mark, without
// which Excel reads UTF-8 as the local code page and garbles every accented letter.
export function writeSpreadsheetCsv(rows: CsvValue[][]): string {
  const safe = rows.map((row) =>
    row.map((cell) => (typeof cell === "string" ? neutraliseFormula(cell) : cell)),
  );
  return BOM + writeCsv(safe);
}
