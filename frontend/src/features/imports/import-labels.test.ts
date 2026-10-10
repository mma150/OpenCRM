import { describe, expect, it } from "vitest";

import { formatFileSize, importTemplate, importTypeFromAddress, rowCount } from "./import-labels";
import type { ImportField } from "./imports.types";

const field = (label: string): ImportField => ({
  key: label,
  label,
  required: false,
  kind: "TEXT",
});

describe("import labels", () => {
  it("reads the type from the address, leads when it names nothing known", () => {
    expect(importTypeFromAddress("contacts")).toBe("CONTACT");
    expect(importTypeFromAddress("companies")).toBe("COMPANY");
    expect(importTypeFromAddress("leads")).toBe("LEAD");
    expect(importTypeFromAddress("opportunities")).toBe("LEAD");
    expect(importTypeFromAddress(null)).toBe("LEAD");
  });

  it("writes a template of one header row, quoting a name with a comma or a quote", () => {
    const template = importTemplate([
      field("First name"),
      field("Size, in seats"),
      field('The "big" one'),
    ]);

    expect(template).toBe('﻿First name,"Size, in seats","The ""big"" one"\r\n');
  });

  it("writes file sizes and row counts in words", () => {
    expect(formatFileSize(300)).toBe("1 KB");
    expect(formatFileSize(12 * 1024)).toBe("12 KB");
    expect(formatFileSize(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(rowCount(1)).toBe("1 row");
    expect(rowCount(4800)).toBe("4,800 rows");
  });
});
