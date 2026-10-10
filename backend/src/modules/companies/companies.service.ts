import type { Company, Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/app-error";
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

function toApiCompany(company: CompanyWithOwner): ApiCompany {
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
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
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

export async function listCompanies(
  actor: Actor,
  query: CompanyListQuery,
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
    AND: [visibleCompanies(actor), { industry, ownerId: query.ownerId }, ...search],
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: withOwnerAndContactCount(actor),
      orderBy: orderBy(query),
      ...pageWindow(query),
    }),
    prisma.company.count({ where }),
  ]);
  return { items: companies.map((company) => toApiCompany(company)), total };
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
  return toApiCompany(await findCompany(actor, id));
}

export async function createCompany(actor: Actor, input: CreateCompanyBody): Promise<ApiCompany> {
  assertCanWrite(actor);
  const { ownerId = actor.id, ...fields } = input;
  await assertAssignable(actor, ownerId, "companies");

  // Every change the timeline records is made in one transaction with its entry.
  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: { ...fields, ownerId, createdById: actor.id },
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
  return toApiCompany(company);
}

// Editing a company's details is not history, so it writes no timeline entry.
export async function updateCompany(
  actor: Actor,
  id: string,
  input: UpdateCompanyBody,
): Promise<ApiCompany> {
  assertCanWrite(actor);
  await findCompany(actor, id);
  const updated = await prisma.company.update({
    where: { id },
    data: input,
    include: withOwnerAndContactCount(actor),
  });
  return toApiCompany(updated);
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
    return toApiCompany(company);
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
  return toApiCompany(updated);
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
