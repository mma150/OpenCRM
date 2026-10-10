"use client";

import { Building2 } from "lucide-react";

import {
  RecordFilter,
  RecordPicker,
  type RecordPickerKind,
} from "@/components/shared/record-picker";

import { getCompany, listCompanies } from "./companies.api";
import type { CompanyRef } from "./companies.types";

// What the shared record picker needs to know about companies: what they are called and how
// to search them (GET /companies?search=, by name).
const COMPANY: RecordPickerKind = {
  label: "Company",
  noun: "company",
  plural: "companies",
  icon: Building2,
  search: async (text, pageSize) => {
    const list = await listCompanies({
      ...(text ? { search: text } : {}),
      sort: "name",
      order: "asc",
      page: 1,
      pageSize,
    });
    return {
      matches: list.companies.map(({ id, name }) => ({ id, name })),
      total: list.total,
    };
  },
  find: getCompany,
};

// Chooses one company from all the companies the user may see, by searching for its name.
// It is built for any number of companies, so it never loads them all, and it works the same
// on a phone. In a form it is the control of a FormField:
//
//   <CompanyPicker id={id} value={company} onChange={setCompany}
//     invalid={invalid} describedBy={describedBy} />
export function CompanyPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  // The company that is picked, or null for none.
  value: CompanyRef | null;
  onChange: (company: CompanyRef | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <RecordPicker
      kind={COMPANY}
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}

// The Company filter above a list (ListToolbar's `extra`). `of` is what the list holds, for
// the sentence in the dialog: "Show only the contacts of one company."
export function CompanyFilter({
  companyId,
  onChange,
  of = "contacts",
}: {
  // "" when the filter is off.
  companyId: string;
  onChange: (companyId: string) => void;
  of?: string;
}) {
  return (
    <RecordFilter
      kind={COMPANY}
      recordId={companyId}
      onChange={onChange}
      description={`Show only the ${of} of one company.`}
    />
  );
}
