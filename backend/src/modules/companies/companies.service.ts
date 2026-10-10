import type { Company, CustomField, Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/app-error";
import {
  buildCsvExport,
  type CsvExport,
  customFieldColumns,
  type ExportColumn,
  exportWindow,
  momentFormatter,
} from "../../lib/csv-export";
import {
  type CustomFieldFilter,
  customFieldsForCreate,
  customFieldsForUpdate,
  customFieldWhere,
  listActiveCustomFields,
  toApiCustomFields,
} from "../../lib/custom-fields";
import { escapeWildcards, type Page, pageWindow, searchWords } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import {
  type Actor,
  assertCanReassign,
  assertCanWrite,
  visibleRecords,
} from "../../lib/record-access";
import { assertAssignable, type RecordOwner, withOwner } from "../../lib/record-owner";
import { addTimelineEntry } from "../../lib/timeline";
import type {
  ApiCompany,
  CompanyExportQuery,
  CompanyListQuery,
  CreateCompanyBody,
  UpdateCompanyBody,
} from "./companies.schema";

// What every query that answers with a company includes: the owner, and how many of its
// contacts the caller may see (never a deleted one, never one outside their reach).
function withOwnerAndContactCount(actor: Actor) {
  return {
    ...withOwner,
    _count: { select: { contacts: { where: { deletedAt: null, ...visibleRecords(actor) } } } },
  } satisfies Prisma.CompanyInclude;
}

type CompanyWithOwner = Company & { owner: RecordOwner; _count: { contacts: number } };

function toApiCompany(company: CompanyWithOwner, fields: CustomField[]): ApiCompany {
  return {
    id: company.id,
    name: company.name,
    website: company.website,
    industry: company.industry,
    phone: company.phone,
    address: company.address,
    notes: company.notes,
    owner: company.owner,
    contactCount: company._count.contacts,
    customFields: toApiCustomFields(fields, company.customFields),
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

// A company as the API answers with it: its custom fields are the ones in use right now.
async function presentCompany(company: CompanyWithOwner): Promise<ApiCompany> {
  return toApiCompany(company, await listActiveCustomFields("COMPANY"));
}

// Every query starts here: the companies this user may see, never a deleted one.
// Exported for the contacts service, which shows a contact's company only when it is one.
export function visibleCompanies(actor: Actor): Prisma.CompanyWhereInput {
  return { deletedAt: null, ...visibleRecords(actor) };
}

// A company the user may not see answers exactly like one that does not exist.
// Exported for the timeline service, which applies the same rule to a company's entries.
export async function findCompany(actor: Actor, id: string): Promise<CompanyWithOwner> {
  const company = await prisma.company.findFirst({
    where: { id, ...visibleCompanies(actor) },
    include: withOwnerAndContactCount(actor),
  });
  if (!company) {
    throw new AppError("NOT_FOUND", 404, "Company not found");
  }
  return company;
}

// `id` breaks ties, so a row never appears on two pages or on none.
function orderBy(query: CompanyListQuery): Prisma.CompanyOrderByWithRelationInput[] {
  const { sort, order } = query;
  const tieBreak = { id: order };
  // A company without an industry sorts last in both directions.
  if (sort === "industry") {
    return [{ industry: { sort: order, nulls: "last" } }, tieBreak];
  }
  return [{ [sort]: order }, tieBreak];
}

// What the list and the export share: the companies that match, in order, within `window`.
async function findCompanies(
  actor: Actor,
  query: CompanyListQuery,
  filters: CustomFieldFilter[],
  fields: CustomField[],
  window: { skip: number; take: number },
): Promise<Page<ApiCompany>> {
  // Every word typed must appear in the name, the website or the industry.
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return { OR: [{ name: contains }, { website: contains }, { industry: contains }] };
  });
  const industry = query.industry
    ? { equals: escapeWildcards(query.industry), mode: "insensitive" as const }
    : undefined;
  const where: Prisma.CompanyWhereInput = {
    AND: [
      visibleCompanies(actor),
      { industry, ownerId: query.ownerId },
      ...customFieldWhere(fields, filters),
      ...search,
    ],
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: withOwnerAndContactCount(actor),
      orderBy: orderBy(query),
      ...window,
    }),
    prisma.company.count({ where }),
  ]);
  return { items: companies.map((company) => toApiCompany(company, fields)), total };
}

export async function listCompanies(
  actor: Actor,
  query: CompanyListQuery,
  filters: CustomFieldFilter[],
): Promise<Page<ApiCompany>> {
  const fields = await listActiveCustomFields("COMPANY");
  return findCompanies(actor, query, filters, fields, pageWindow(query));
}

// DATA-03: the list as a CSV file, for everyone who can see the list.
export async function exportCompanies(
  actor: Actor,
  query: CompanyExportQuery,
  filters: CustomFieldFilter[],
): Promise<CsvExport> {
  const fields = await listActiveCustomFields("COMPANY");
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiCompany>[] = [
    { header: "Name", value: (company) => company.name },
    { header: "Website", value: (company) => company.website },
    { header: "Industry", value: (company) => company.industry },
    { header: "Phone", value: (company) => company.phone },
    { header: "Address", value: (company) => company.address },
    { header: "Owner", value: (company) => company.owner.name },
    { header: "Contacts", value: (company) => company.contactCount },
    { header: "Notes", value: (company) => company.notes },
    { header: "Created", value: (company) => moment(company.createdAt) },
    { header: "Updated", value: (company) => moment(company.updatedAt) },
    ...customFieldColumns<ApiCompany>(fields),
  ];
  return buildCsvExport(columns, await findCompanies(actor, query, filters, fields, exportWindow));
}

// The industries in use among the companies the caller may see, for the list's filter.
// Two spellings that differ only in case are one industry, as they are for the filter.
export async function listIndustries(actor: Actor): Promise<string[]> {
  const rows = await prisma.company.findMany({
    where: { ...visibleCompanies(actor), industry: { not: null } },
    select: { industry: true },
    distinct: ["industry"],
    orderBy: { industry: "asc" },
  });
  const bySpelling = new Map<string, string>();
  for (const { industry } of rows) {
    if (industry && !bySpelling.has(industry.toLowerCase())) {
      bySpelling.set(industry.toLowerCase(), industry);
    }
  }
  return [...bySpelling.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export async function getCompany(actor: Actor, id: string): Promise<ApiCompany> {
  return presentCompany(await findCompany(actor, id));
}

export async function createCompany(actor: Actor, input: CreateCompanyBody): Promise<ApiCompany> {
  assertCanWrite(actor);
  const { ownerId = actor.id, customFields: sent, ...fields } = input;
  await assertAssignable(actor, ownerId, "companies");
  const activeFields = await listActiveCustomFields("COMPANY");
  const customFields = customFieldsForCreate(activeFields, sent);

  // Every change the timeline records is made in one transaction with its entry.
  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: { ...fields, customFields, ownerId, createdById: actor.id },
      include: withOwnerAndContactCount(actor),
    });
    await addTimelineEntry(tx, {
      kind: "CREATED",
      authorId: actor.id,
      record: { type: "company", id: created.id },
      occurredAt: created.createdAt,
    });
    return created;
  });
  return toApiCompany(company, activeFields);
}

// Editing a company's details is not history, so it writes no timeline entry.
export async function updateCompany(
  actor: Actor,
  id: string,
  input: UpdateCompanyBody,
): Promise<ApiCompany> {
  assertCanWrite(actor);
  const company = await findCompany(actor, id);
  const { customFields: sent, ...fields } = input;
  const customFields = await customFieldsForUpdate("COMPANY", company.customFields, sent);
  const updated = await prisma.company.update({
    where: { id },
    data: { ...fields, customFields },
    include: withOwnerAndContactCount(actor),
  });
  return presentCompany(updated);
}

// The company must be one the caller can see, and the new owner one they may assign to.
// Its contacts keep their own owners.
export async function assignCompany(
  actor: Actor,
  id: string,
  ownerId: string,
): Promise<ApiCompany> {
  assertCanReassign(actor);
  const company = await findCompany(actor, id);
  await assertAssignable(actor, ownerId, "companies");
  // Assigning a company to the owner it already has changes nothing, so it writes no entry.
  if (ownerId === company.ownerId) {
    return presentCompany(company);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.company.update({
      where: { id },
      data: { ownerId },
      include: withOwnerAndContactCount(actor),
    });
    await addTimelineEntry(tx, {
      kind: "ASSIGNMENT",
      authorId: actor.id,
      record: { type: "company", id },
      details: { fromOwner: company.owner, toOwner: changed.owner },
    });
    return changed;
  });
  return presentCompany(updated);
}

// A soft delete: the row stays for history, and no response ever shows it again. Its
// contacts and opportunities stay too, but no longer belong to a company; all of it happens
// or none of it does.
export async function deleteCompany(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  await findCompany(actor, id);
  await prisma.$transaction([
    prisma.contact.updateMany({ where: { companyId: id }, data: { companyId: null } }),
    prisma.opportunity.updateMany({ where: { companyId: id }, data: { companyId: null } }),
    prisma.company.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
}
