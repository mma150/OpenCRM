import { describe, expect, it } from "vitest";

import {
  CsvError,
  neutraliseFormula,
  parseCsv,
  restoreFormula,
  writeCsv,
  writeSpreadsheetCsv,
} from "./csv";

describe("parseCsv", () => {
  it("reads plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("reads the last row with or without a line end", () => {
    expect(parseCsv("a,b\n1,2")).toEqual(parseCsv("a,b\n1,2\n"));
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("treats CRLF, LF and a lone CR as line ends", () => {
    expect(parseCsv("a\r\nb\nc\rd")).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("drops a UTF-8 byte order mark at the start, and only there", () => {
    expect(parseCsv("﻿name\nAsha")).toEqual([["name"], ["Asha"]]);
    expect(parseCsv("name\n﻿Asha")).toEqual([["name"], ["﻿Asha"]]);
  });

  it("reads quoted cells with commas, quotes and line breaks inside", () => {
    expect(parseCsv('name,note\n"Rao, Asha","said ""hello""\nand left"\n')).toEqual([
      ["name", "note"],
      ["Rao, Asha", 'said "hello"\nand left'],
    ]);
  });

  it("keeps a CRLF inside a quoted cell as it is", () => {
    expect(parseCsv('"a\r\nb",c')).toEqual([["a\r\nb", "c"]]);
  });

  it("keeps empty cells, quoted or not", () => {
    expect(parseCsv('a,,"",d\n,\n')).toEqual([
      ["a", "", "", "d"],
      ["", ""],
    ]);
  });

  it("keeps spaces around an unquoted cell", () => {
    expect(parseCsv(" a , b ")).toEqual([[" a ", " b "]]);
  });

  it("keeps an empty line as a row of one empty cell, so row numbers stay true", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], [""], ["b"]]);
  });

  it("returns rows of different lengths as they are", () => {
    expect(parseCsv("a,b,c\n1\n1,2,3,4\n")).toEqual([["a", "b", "c"], ["1"], ["1", "2", "3", "4"]]);
  });

  it("keeps a quote in the middle of an unquoted cell", () => {
    expect(parseCsv('5" pipe,x')).toEqual([['5" pipe', "x"]]);
  });

  it("keeps text that follows a closing quote", () => {
    expect(parseCsv('"ab"c,d')).toEqual([["abc", "d"]]);
  });

  it("returns nothing for an empty file and for a byte order mark alone", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿")).toEqual([]);
  });

  it("reads a quoted empty cell as the last thing in the file", () => {
    expect(parseCsv('a\n""')).toEqual([["a"], [""]]);
  });

  it("reads text outside the ASCII range", () => {
    expect(parseCsv("name\nZoë Müller\n田中\n")).toEqual([["name"], ["Zoë Müller"], ["田中"]]);
  });

  it("refuses a quoted cell that is never closed", () => {
    expect(() => parseCsv('a,b\n"open,2\n')).toThrow(CsvError);
  });
});

describe("writeCsv", () => {
  it("writes CRLF line ends, one after the last row", () => {
    expect(
      writeCsv([
        ["a", "b"],
        [1, null],
      ]),
    ).toBe("a,b\r\n1,\r\n");
  });

  it("quotes a cell with a comma, a quote or a line break, and doubles the quote", () => {
    expect(writeCsv([["Rao, Asha", 'say "hi"', "two\nlines", "cr\rhere"]])).toBe(
      '"Rao, Asha","say ""hi""","two\nlines","cr\rhere"\r\n',
    );
  });

  it("quotes a cell that starts or ends with a space", () => {
    expect(writeCsv([[" a", "b ", "c d"]])).toBe('" a","b ",c d\r\n');
  });

  it("writes numbers as they are", () => {
    expect(writeCsv([[0, -5, 1200.5]])).toBe("0,-5,1200.5\r\n");
  });

  it("writes nothing for no rows", () => {
    expect(writeCsv([])).toBe("");
  });
});

describe("writing and reading back", () => {
  it("returns the same cells, whatever they hold", () => {
    const rows = [
      ["name", "note", "empty"],
      ["Rao, Asha", 'said "hello"', ""],
      ["line\nbreak", "crlf\r\nbreak", " padded "],
      ['"', '""', ","],
      ["Zoë", "田中", "'=1+1"],
      ["", "", ""],
    ];

    expect(parseCsv(writeCsv(rows))).toEqual(rows);
  });

  it("returns the same cells through the spreadsheet writer once formulas are restored", () => {
    const rows = [
      ["phone", "note"],
      ["+44 20 7946 0000", "=SUM(A1:A9)"],
      ["-", "@home"],
    ];

    const read = parseCsv(writeSpreadsheetCsv(rows));

    expect(read.map((row) => row.map((cell) => restoreFormula(cell)))).toEqual(rows);
  });
});

describe("neutraliseFormula", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+44 20 7946 0000", "'+44 20 7946 0000"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "'\rcmd"],
  ])("puts an apostrophe before %j", (text, safe) => {
    expect(neutraliseFormula(text)).toBe(safe);
  });

  it.each(["Asha", "a=b", "1+1", "", " =1+1", "'=1+1"])("leaves %j alone", (text) => {
    expect(neutraliseFormula(text)).toBe(text);
  });
});

describe("restoreFormula", () => {
  it("removes only an apostrophe that neutraliseFormula would have added", () => {
    expect(restoreFormula("'=1+1")).toBe("=1+1");
    expect(restoreFormula("'+44")).toBe("+44");
    expect(restoreFormula("'quoted'")).toBe("'quoted'");
    expect(restoreFormula("O'Brien")).toBe("O'Brien");
    expect(restoreFormula("'")).toBe("'");
  });
});

describe("writeSpreadsheetCsv", () => {
  it("starts with a byte order mark and neutralises text cells but not numbers", () => {
    const csv = writeSpreadsheetCsv([
      ["Name", "Value"],
      ['=HYPERLINK("http://evil","x")', -5],
    ]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Name,Value\r\n"\'=HYPERLINK(""http://evil"",""x"")",-5\r\n');
  });
});
