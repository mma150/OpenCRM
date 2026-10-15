import type { Response } from "express";
import PDFDocument from "pdfkit";

import { formatMoney, type SalesDocument } from "./sales-documents";

// QUOT-03: a quote or an invoice as a PDF file, drawn from the same print-ready document the
// web print view uses (GET /quotes/:id/document), with the same content in the same order:
// the title, number and dates; who it is from and for; what it is about and who prepared it;
// the lines; the totals with one row per tax rate; the notes and the terms. A4 portrait.
//
// The fonts are the PDF standard fonts (Helvetica), so no font file ships with the API. They
// can only write the WinAnsi character set (Latin-1 and a few more, such as the euro sign
// and curly quotes). Anything else, such as emoji or a name in Cyrillic, Greek, Arabic or
// Chinese script, is written as "?" (toWinAnsi below). Embedding a Unicode font would lift
// that limit; it is a later change.

type Doc = PDFKit.PDFDocument;

const MARGIN = 45; // about 16 mm, as the web print view's @page rule
const FOOTER_SPACE = 24; // kept free above the bottom margin for the page footer
const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";
const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";

const BODY_SIZE = 9.5;
const BODY_LEADING = 12.5;
const LABEL_SIZE = 7.5;

// The characters WinAnsi has beyond Latin-1, by their Unicode code point.
const WIN_ANSI_EXTRA = new Set([
  0x01_52, 0x01_53, 0x01_60, 0x01_61, 0x01_78, 0x01_7d, 0x01_7e, 0x01_92, 0x02_c6, 0x02_dc, 0x20_13,
  0x20_14, 0x20_18, 0x20_19, 0x20_1a, 0x20_1c, 0x20_1d, 0x20_1e, 0x20_20, 0x20_21, 0x20_22, 0x20_26,
  0x20_30, 0x20_39, 0x20_3a, 0x20_ac, 0x21_22,
]);

// Text the standard fonts can write: line breaks kept, tabs as spaces, accents composed onto
// their letter where Latin-1 has the letter, marks, skin tones and invisible format characters dropped,
// and every other character replaced by "?". Exported for the tests.
export function toWinAnsi(text: string): string {
  const normalised = text
    .normalize("NFC")
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll("\t", "    ")
    .replaceAll(/[\p{M}\p{Cf}\p{Emoji_Modifier}]/gu, "");
  let result = "";
  for (const char of normalised) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      result += char;
    } else if (WIN_ANSI_EXTRA.has(code)) {
      result += char;
    } else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) {
      // Another control character: nothing to draw.
    } else {
      result += "?";
    }
  }
  return result;
}

// Numbers, percentages and days written exactly as the web app writes them (lib/format.ts).
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });
// A day column is the same day for everyone, so it is read and written in UTC.
const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

function humanize(value: string): string {
  return `${value.charAt(0)}${value.slice(1).toLowerCase()}`;
}

// "Discount (10%)" for a percentage, "Discount" for an amount, as on the web.
function discountLabel(document: SalesDocument): string {
  return document.discountType === "PERCENT" && document.discountValue !== null
    ? `Discount (${formatPercent(document.discountValue)})`
    : "Discount";
}

// A draft and a sent document are what a customer expects to receive, so they carry no
// status; every other status (accepted, declined, expired, paid, overdue, void) is printed.
function shownStatus(status: string): string | null {
  return status === "DRAFT" || status === "SENT" ? null : humanize(status);
}

// "Q-0001.pdf". The number is made by the server (Q-0001, INV-0001), but anything outside
// letters, digits and dashes is dropped anyway, because the name goes into a header.
export function salesDocumentFilename(document: Pick<SalesDocument, "number">): string {
  const safe = document.number.replaceAll(/[^A-Za-z0-9-]/g, "");
  return `${safe || "document"}.pdf`;
}

interface Font {
  font: string;
  size: number;
  color: string;
}

const body: Font = { font: REGULAR, size: BODY_SIZE, color: INK };
const bodyBold: Font = { font: BOLD, size: BODY_SIZE, color: INK };
const muted: Font = { font: REGULAR, size: BODY_SIZE, color: MUTED };
const label: Font = { font: BOLD, size: LABEL_SIZE, color: MUTED };

// The drawing surface: where the next thing goes, and a new page when it does not fit.
class Sheet {
  readonly doc: Doc;
  readonly left = MARGIN;
  readonly right: number;
  readonly width: number;
  readonly top = MARGIN;
  readonly bottom: number;
  y = MARGIN;
  // Called on every new page, after the page was added (the lines table repeats its header).
  onNewPage: (() => void) | null = null;

  constructor(doc: Doc) {
    this.doc = doc;
    this.right = doc.page.width - MARGIN;
    this.width = this.right - this.left;
    this.bottom = doc.page.height - MARGIN - FOOTER_SPACE;
  }

  use(font: Font): void {
    this.doc.font(font.font).fontSize(font.size).fillColor(font.color);
  }

  widthOf(text: string, font: Font): number {
    this.doc.font(font.font).fontSize(font.size);
    return this.doc.widthOfString(text);
  }

  // One line of text at an exact place. Never wraps and never adds a page.
  write(text: string, x: number, y: number, font: Font): void {
    this.use(font);
    this.doc.text(text, x, y, { lineBreak: false });
  }

  writeRight(text: string, rightEdge: number, y: number, font: Font): void {
    this.write(text, rightEdge - this.widthOf(text, font), y, font);
  }

  // The text broken into lines no wider than `width`: at spaces where it can, inside a word
  // that is wider than the whole line. Line breaks in the text are kept; an empty line too.
  wrap(text: string, width: number, font: Font): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (this.widthOf(candidate, font) <= width) {
          line = candidate;
          continue;
        }
        if (line !== "") {
          lines.push(line);
        }
        line = word;
        // A word that does not fit on a line of its own is cut where the line is full.
        while (this.widthOf(line, font) > width && line.length > 1) {
          let cut = 1;
          while (cut < line.length && this.widthOf(line.slice(0, cut + 1), font) <= width) {
            cut += 1;
          }
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  newPage(): void {
    this.doc.addPage();
    this.y = this.top;
    this.onNewPage?.();
  }

  // Starts a new page unless `height` still fits on this one.
  ensure(height: number): void {
    if (this.y + height > this.bottom && this.y > this.top) {
      this.newPage();
    }
  }

  get spaceLeft(): number {
    return this.bottom - this.y;
  }

  rule(y: number, weight: number, color: string, from = this.left, to = this.right): void {
    this.doc.save().moveTo(from, y).lineTo(to, y).lineWidth(weight).strokeColor(color).stroke();
    this.doc.restore();
  }

  // Lines of text flowed down the page, onto the next one when the page is full.
  flow(lines: string[], x: number, font: Font, leading = BODY_LEADING): void {
    for (const line of lines) {
      this.ensure(leading);
      this.write(line, x, this.y, font);
      this.y += leading;
    }
  }
}

// ---------------------------------------------------------------------------------------
// The parts of the sheet, top to bottom
// ---------------------------------------------------------------------------------------

function drawHeader(sheet: Sheet, document: SalesDocument): void {
  const isQuote = document.kind === "QUOTE";
  const top = sheet.y;

  // The dates, label and value in two columns.
  const facts: [string, string][] = [["Issue date", formatDay(document.issueDate)]];
  if (isQuote && document.validUntil) {
    facts.push(["Valid until", formatDay(document.validUntil)]);
  }
  if (document.dueDate) {
    facts.push(["Due date", formatDay(document.dueDate)]);
  }
  if (document.paymentTermsDays !== null) {
    facts.push([
      "Payment terms",
      document.paymentTermsDays === 0
        ? "Due on receipt"
        : `${String(document.paymentTermsDays)} days`,
    ]);
  }
  if (document.quoteNumber) {
    facts.push(["Quote", toWinAnsi(document.quoteNumber)]);
  }
  const factsLeft = sheet.right - 190;

  // The title, the number and the status on the left.
  const titleWidth = factsLeft - sheet.left - 16;
  let leftY = top;
  sheet.write(isQuote ? "Quote" : "Invoice", sheet.left, leftY, {
    font: BOLD,
    size: 22,
    color: INK,
  });
  leftY += 28;
  for (const line of sheet.wrap(toWinAnsi(document.number), titleWidth, bodyBold)) {
    sheet.write(line, sheet.left, leftY, { ...bodyBold, size: 12 });
    leftY += 15;
  }
  const status = shownStatus(document.status);
  if (status) {
    sheet.write(`Status: ${status}`, sheet.left, leftY + 2, muted);
    leftY += 16;
  }

  // The dates on the right, after the title, so the text reads in that order too.
  let factsY = top + 4;
  for (const [name, value] of facts) {
    sheet.write(name, factsLeft, factsY, muted);
    sheet.writeRight(value, sheet.right, factsY, bodyBold);
    factsY += 14;
  }

  sheet.y = Math.max(leftY, factsY) + 22;
}

function partyLines(lines: (string | null)[]): string[] {
  return lines
    .filter((line): line is string => line !== null && line.trim() !== "")
    .map((line) => toWinAnsi(line));
}

// "From" and "Prepared for" (or "Bill to") side by side, flowed down together line by line,
// so a very long address still continues on the next page.
function drawParties(sheet: Sheet, document: SalesDocument): void {
  const { seller, buyer } = document;
  const gap = 24;
  const columnWidth = (sheet.width - gap) / 2;
  const rightX = sheet.left + columnWidth + gap;

  const column = (lines: string[]): { text: string; font: Font }[] => {
    if (lines.length === 0) {
      return [{ text: "—", font: muted }];
    }
    return lines.flatMap((line, index) => {
      const font = index === 0 ? bodyBold : body;
      return sheet.wrap(line, columnWidth, font).map((text) => ({ text, font }));
    });
  };
  const from = column(
    partyLines([
      seller.name,
      seller.address,
      seller.email,
      seller.phone,
      seller.taxId ? `Tax ID: ${seller.taxId}` : null,
    ]),
  );
  const to = column(
    partyLines([
      buyer.companyName ?? buyer.contactName,
      buyer.companyName ? buyer.contactName : null,
      buyer.companyAddress,
      buyer.contactEmail,
    ]),
  );

  sheet.ensure(14 + 2 * BODY_LEADING);
  sheet.write("FROM", sheet.left, sheet.y, label);
  sheet.write(document.kind === "QUOTE" ? "PREPARED FOR" : "BILL TO", rightX, sheet.y, label);
  sheet.y += 14;
  for (let index = 0; index < Math.max(from.length, to.length); index += 1) {
    sheet.ensure(BODY_LEADING);
    const left = from[index];
    const right = to[index];
    if (left) {
      sheet.write(left.text, sheet.left, sheet.y, left.font);
    }
    if (right) {
      sheet.write(right.text, rightX, sheet.y, right.font);
    }
    sheet.y += BODY_LEADING;
  }
  sheet.y += 14;
}

// What the document is about and who made it, as the web's "Regarding ... · Prepared by".
function drawRegarding(sheet: Sheet, document: SalesDocument): void {
  const labelWidth = 70;
  const rows: [string, string][] = [
    ["Regarding", document.opportunityName],
    ["Prepared by", `${document.preparedBy.name} (${document.preparedBy.email})`],
  ];
  for (const [name, value] of rows) {
    const lines = sheet.wrap(toWinAnsi(value), sheet.width - labelWidth, body);
    sheet.ensure(BODY_LEADING);
    sheet.write(name, sheet.left, sheet.y, muted);
    sheet.flow(lines, sheet.left + labelWidth, body);
  }
  sheet.y += 14;
}

interface Column {
  title: string;
  width: number;
}

// Description takes what the number columns leave.
const NUMBER_COLUMNS: Column[] = [
  { title: "QTY", width: 44 },
  { title: "UNIT PRICE", width: 76 },
  { title: "DISC.", width: 42 },
  { title: "TAX", width: 42 },
  { title: "AMOUNT", width: 84 },
];
const CELL_PADDING = 6;
const TABLE_HEADER_HEIGHT = 20;

function drawLines(sheet: Sheet, document: SalesDocument): void {
  if (document.lines.length === 0) {
    sheet.ensure(BODY_LEADING);
    sheet.write("No line items.", sheet.left, sheet.y, muted);
    sheet.y += BODY_LEADING + 14;
    return;
  }

  const numbersWidth = NUMBER_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const descriptionWidth = sheet.width - numbersWidth - CELL_PADDING;
  // The right edge of each number column.
  const edges: number[] = [];
  let edge = sheet.left + descriptionWidth + CELL_PADDING;
  for (const column of NUMBER_COLUMNS) {
    edge += column.width;
    edges.push(edge);
  }

  const header = () => {
    const y = sheet.y + 4;
    sheet.write("DESCRIPTION", sheet.left, y, label);
    NUMBER_COLUMNS.forEach((column, index) => {
      sheet.writeRight(column.title, edges[index] ?? sheet.right, y, label);
    });
    sheet.y += TABLE_HEADER_HEIGHT;
    sheet.rule(sheet.y - 4, 1, INK);
  };

  const rows = document.lines.map((line) => ({
    description: sheet.wrap(toWinAnsi(line.description), descriptionWidth, body),
    numbers: [
      formatNumber(line.quantity),
      formatMoney(line.unitPrice),
      line.discountPercent > 0 ? formatPercent(line.discountPercent) : "—",
      formatPercent(line.taxRate),
      formatMoney(line.lineTotal),
    ],
  }));
  const rowHeight = (lines: number) => lines * BODY_LEADING + CELL_PADDING;
  const pageRoom = sheet.bottom - sheet.top - TABLE_HEADER_HEIGHT;

  // The header never stands alone at the bottom of a page.
  sheet.ensure(TABLE_HEADER_HEIGHT + rowHeight(Math.min(rows[0]?.description.length ?? 1, 3)));
  header();
  sheet.onNewPage = header;

  for (const row of rows) {
    const height = rowHeight(row.description.length);
    // A row goes to the next page whole when it fits on a page at all; only a row taller
    // than a page is split, and then only between two lines of its description.
    if (height <= pageRoom) {
      sheet.ensure(height);
    } else {
      sheet.ensure(rowHeight(1));
    }
    const top = sheet.y + 2;
    row.numbers.forEach((value, index) => {
      sheet.writeRight(value, edges[index] ?? sheet.right, top, body);
    });
    let lineY = top;
    for (const [index, text] of row.description.entries()) {
      if (index > 0 && lineY + BODY_LEADING > sheet.bottom) {
        sheet.newPage();
        lineY = sheet.y + 2;
      }
      sheet.write(text, sheet.left, lineY, body);
      lineY += BODY_LEADING;
    }
    sheet.y = lineY + CELL_PADDING - 2;
    sheet.rule(sheet.y - 2, 0.5, RULE);
  }
  sheet.onNewPage = null;
  sheet.y += 12;
}

// Subtotal, discount, one row per tax rate and the total, on the right, kept together.
function drawTotals(sheet: Sheet, document: SalesDocument): void {
  const rows: [string, string][] = [["Subtotal", formatMoney(document.subtotal)]];
  if (document.discountTotal > 0) {
    rows.push([discountLabel(document), `-${formatMoney(document.discountTotal)}`]);
  }
  if (document.taxes.length === 0) {
    rows.push(["Tax", formatMoney(document.taxTotal)]);
  }
  for (const tax of document.taxes) {
    rows.push([
      `Tax ${formatPercent(tax.rate)} on ${formatMoney(tax.taxableAmount)}`,
      formatMoney(tax.taxAmount),
    ]);
  }
  const leading = 15;
  const totalSize = 11;
  sheet.ensure(rows.length * leading + 10 + totalSize + 10);

  const blockLeft = sheet.right - 260;
  for (const [name, value] of rows) {
    sheet.write(name, blockLeft, sheet.y, muted);
    sheet.writeRight(value, sheet.right, sheet.y, body);
    sheet.y += leading;
  }
  sheet.y += 2;
  sheet.rule(sheet.y, 1, INK, blockLeft, sheet.right);
  sheet.y += 7;
  const strong: Font = { font: BOLD, size: totalSize, color: INK };
  sheet.write(`Total (${toWinAnsi(document.currency)})`, blockLeft, sheet.y, strong);
  sheet.writeRight(formatMoney(document.total), sheet.right, sheet.y, strong);
  sheet.y += totalSize + 22;
}

// Notes or terms: a label and the text, flowed onto the next page when it is long.
function drawText(sheet: Sheet, title: string, text: string | null): void {
  if (!text?.trim()) {
    return;
  }
  const lines = sheet.wrap(toWinAnsi(text.trim()), sheet.width, body);
  // The label keeps at least two lines of its text with it.
  sheet.ensure(14 + Math.min(lines.length, 2) * BODY_LEADING);
  sheet.write(title, sheet.left, sheet.y, label);
  sheet.y += 14;
  sheet.flow(lines, sheet.left, { ...body, color: "#374151" });
  sheet.y += 14;
}

// "Quote Q-0001" and "Page 1 of 3" at the foot of every page, written once all pages exist.
function drawFooters(sheet: Sheet, document: SalesDocument): void {
  const { doc } = sheet;
  const range = doc.bufferedPageRange();
  const footer: Font = { font: REGULAR, size: 8, color: MUTED };
  const name = `${document.kind === "QUOTE" ? "Quote" : "Invoice"} ${toWinAnsi(document.number)}`;
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const y = doc.page.height - MARGIN - 8;
    sheet.rule(y - 6, 0.5, RULE);
    sheet.write(name, sheet.left, y, footer);
    sheet.writeRight(`Page ${String(index + 1)} of ${String(range.count)}`, sheet.right, y, footer);
  }
}

export interface PdfOptions {
  // Compressed content streams make a smaller file; the tests turn it off to read the text.
  compress?: boolean;
}

// The document as a PDF file in memory. A quote of 100 lines is a few pages and a few dozen
// kilobytes, so nothing is streamed.
export function renderSalesDocumentPdf(
  document: SalesDocument,
  options: PdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const title = `${document.kind === "QUOTE" ? "Quote" : "Invoice"} ${document.number}`;
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      // Kept until the end, so every footer can say how many pages there are.
      bufferPages: true,
      compress: options.compress ?? true,
      displayTitle: true,
      lang: "en-US",
      info: {
        Title: toWinAnsi(title),
        Author: toWinAnsi(document.seller.name || "OpenCRM"),
        Creator: "OpenCRM",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    try {
      const sheet = new Sheet(doc);
      drawHeader(sheet, document);
      drawParties(sheet, document);
      drawRegarding(sheet, document);
      drawLines(sheet, document);
      drawTotals(sheet, document);
      drawText(sheet, "NOTES", document.notes);
      drawText(sheet, "TERMS", document.terms);
      drawFooters(sheet, document);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// A rendered document and the name it is downloaded or attached as.
export interface PdfFile {
  filename: string;
  content: Buffer;
}

// Sends the file as a download named like the document ("Q-0001.pdf"). A plain GET from a
// link works with the session cookie; the mobile app sends its Bearer token instead.
export function sendPdf(res: Response, file: PdfFile): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Content-Length", String(file.content.length));
  res.end(file.content);
}
