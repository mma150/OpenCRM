import type { ImportField, ImportPreview, ImportResult } from "./imports.types";

// What a lead can be imported into: its own fields, then a required custom field.
export const leadImportFields: ImportField[] = [
  { key: "firstName", label: "First name", required: true, kind: "TEXT" },
  { key: "lastName", label: "Last name", required: true, kind: "TEXT" },
  { key: "email", label: "Email", required: false, kind: "EMAIL" },
  { key: "company", label: "Company", required: false, kind: "TEXT" },
  {
    key: "cf:region",
    label: "Region",
    required: true,
    kind: "DROPDOWN",
    options: ["North", "South"],
  },
];

export const contactImportFields: ImportField[] = [
  { key: "firstName", label: "First name", required: true, kind: "TEXT" },
  { key: "lastName", label: "Last name", required: true, kind: "TEXT" },
  { key: "companyName", label: "Company", required: false, kind: "TEXT" },
];

export const LEADS_CSV = [
  "First name,Surname,E-mail,Area,Notes.internal",
  "Ada,Lovelace,ada@example.com,North,x",
  "Grace,,grace@example,South,y",
  "",
].join("\r\n");

// The API recognised two columns and left three for the user.
export const leadPreview: ImportPreview = {
  headers: ["First name", "Surname", "E-mail", "Area", "Notes.internal"],
  sampleRows: [
    ["Ada", "Lovelace", "ada@example.com", "North", "x"],
    ["Grace", "", "grace@example", "South", "y"],
  ],
  rowCount: 2,
  suggestedMapping: {
    "First name": "firstName",
    Surname: null,
    "E-mail": "email",
    Area: null,
    "Notes.internal": null,
  },
};

export const FAILED_CSV =
  "﻿First name,Surname,E-mail,Area,Error\r\nGrace,,grace@example,South,Enter a last name\r\n";

export const leadResult: ImportResult = {
  total: 2,
  created: 1,
  skipped: 0,
  failed: 1,
  companiesCreated: 0,
  errors: [
    {
      row: 3,
      values: {
        "First name": "Grace",
        Surname: "",
        "E-mail": "grace@example",
        Area: "South",
      },
      messages: [
        { field: "Last name", column: "Surname", message: "Enter a last name" },
        { field: "Email", column: "E-mail", message: "Enter a valid email address" },
      ],
    },
  ],
  errorsTruncated: false,
  failedCsv: FAILED_CSV,
};

export const cleanResult: ImportResult = {
  total: 2,
  created: 1,
  skipped: 1,
  failed: 0,
  companiesCreated: 1,
  errors: [],
  errorsTruncated: false,
  failedCsv: null,
};
