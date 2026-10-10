import type { Contact, CustomField, Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
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
import { type Page, pageWindow, searchWords } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import {
  type Actor,
  assertCanReassign,
  assertCanWrite,
  visibleLiveRecords,
  visibleRecords,
} from "../../lib/record-access";
import { assertAssignable, type RecordOwner, withOwner } from "../../lib/record-owner";
import { addTimelineEntry } from "../../lib/timeline";
import { visibleCompanies } from "../companies/companies.service";
import type {
  ApiContact,
  ContactExportQuery,
  ContactListQuery,
  CreateContactBody,
  UpdateContactBody,
} from "./contacts.schema";

// What every query that answers with a contact includes: the owner, and the company only
// when it is one the caller may see. A deleted or hidden company comes back as null. The
// lead it was converted from follows the same rule.
// For reads only. On a write (which Prisma runs in a transaction) it would read this many
// relations side by side on one connection, which the database driver warns about; a
// function that changes a contact reads it again afterwards (getContact) for its answer.
function withOwnerAndCompany(actor: Actor) {
  return {
    ...withOwner,
    company: { where: visibleCompanies(actor), select: { id: true, name: true } },
    convertedLeads: {
      where: visibleLiveRecords(actor),
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ convertedAt: "desc" }, { id: "desc" }],
      take: 1,
    },
  } satisfies Prisma.ContactInclude;
}

type ContactWithOwner = Contact & {
  owner: RecordOwner;
  company: { id: string; name: string } | null;
  convertedLeads: { id: string; firstName: string; lastName: string }[];
};

function toApiContact(contact: ContactWithOwner, fields: CustomField[]): ApiContact {
  const lead = contact.convertedLeads[0];
  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: `${contact.firstName} ${contact.lastName}`,
    jobTitle: contact.jobTitle,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    notes: contact.notes,
    owner: contact.owner,
    convertedFromLead: lead ? { id: lead.id, name: `${lead.firstName} ${lead.lastName}` } : null,
    lastContactAt: contact.lastContactAt?.toISOString() ?? null,
    customFields: toApiCustomFields(fields, contact.customFields),
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

// A contact as the API answers with it: its custom fields are the ones in use right now.
async function presentContact(contact: ContactWithOwner): Promise<ApiContact> {
  return toApiContact(contact, await listActiveCustomFields("CONTACT"));
}

// Every query starts here: the contacts this user may see, never a deleted one.
function visibleContacts(actor: Actor): Prisma.ContactWhereInput {
  return { deletedAt: null, ...visibleRecords(actor) };
}

// A contact the user may not see answers exactly like one that does not exist.
// Exported for the timeline service, which applies the same rule to a contact's entries.
export async function findContact(actor: Actor, id: string): Promise<ContactWithOwner> {
  const contact = await prisma.contact.findFirst({
    where: { id, ...visibleContacts(actor) },
    include: withOwnerAndCompany(actor),
  });
  if (!contact) {
    throw new AppError("NOT_FOUND", 404, "Contact not found");
  }
  return contact;
}

// A contact can only be put in a company its user can see; one they cannot see answers
// exactly like one that does not exist.
async function assertCompanyVisible(actor: Actor, companyId: string): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...visibleCompanies(actor) },
  });
  if (!company) {
    throw fieldError("companyId", "Choose a company you can see");
  }
}

// `id` breaks ties, so a row never appears on two pages or on none.
function orderBy(query: ContactListQuery): Prisma.ContactOrderByWithRelationInput[] {
  const { sort, order } = query;
  const byName = [{ firstName: order }, { lastName: order }, { id: order }];
  switch (sort) {
    case "name": {
      return byName;
    }
    case "company": {
      return [{ company: { name: order } }, ...byName];
    }
    // A contact nobody has spoken to yet sorts last in both directions.
    case "lastContactAt": {
      return [{ lastContactAt: { sort: order, nulls: "last" } }, { id: order }];
    }
    default: {
      return [{ [sort]: order }, { id: order }];
    }
  }
}

// One page of contacts sorted by company name. Contacts without a company the caller can
// see must come last in both directions, which one ORDER BY cannot say across a relation.
// So the list is read as two lists end to end: first the contacts with such a company, in
// company order, then the rest, in name order; the page window runs across both.
async function findPageByCompany(
  actor: Actor,
  where: Prisma.ContactWhereInput,
  query: ContactListQuery,
  window: { skip: number; take: number },
): Promise<ContactWithOwner[]> {
  const { skip, take } = window;
  const include = withOwnerAndCompany(actor);
  const inCompany = { company: visibleCompanies(actor) };
  const withCompany = { AND: [where, inCompany] };
  const withoutCompany = { AND: [where, { NOT: inCompany }] };

  const withCompanyTotal = await prisma.contact.count({ where: withCompany });
  const first = await prisma.contact.findMany({
    where: withCompany,
    include,
    orderBy: orderBy(query),
    skip,
    take,
  });
  if (first.length === take) {
    return first;
  }
  const rest = await prisma.contact.findMany({
    where: withoutCompany,
    include,
    orderBy: orderBy({ ...query, sort: "name" }),
    skip: Math.max(0, skip - withCompanyTotal),
    take: take - first.length,
  });
  return [...first, ...rest];
}

// What the list and the export share: the contacts that match, in order, within `window`.
async function findContacts(
  actor: Actor,
  query: ContactListQuery,
  filters: CustomFieldFilter[],
  fields: CustomField[],
  window: { skip: number; take: number },
): Promise<Page<ApiContact>> {
  // Every word typed must appear in the name, the email or the name of the company (a
  // company the caller cannot see never matches).
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return {
      OR: [
        { firstName: contains },
        { lastName: contains },
        { email: contains },
        { company: { name: contains, ...visibleCompanies(actor) } },
      ],
    };
  });
  // Filtering by a company the caller cannot see finds nothing, like filtering by one
  // that does not exist.
  const inCompany = query.companyId
    ? { company: { id: query.companyId, ...visibleCompanies(actor) } }
    : {};
  const where: Prisma.ContactWhereInput = {
    AND: [
      visibleContacts(actor),
      { ownerId: query.ownerId },
      inCompany,
      ...customFieldWhere(fields, filters),
      ...search,
    ],
  };

  const [contacts, total] = await Promise.all([
    query.sort === "company"
      ? findPageByCompany(actor, where, query, window)
      : prisma.contact.findMany({
          where,
          include: withOwnerAndCompany(actor),
          orderBy: orderBy(query),
          ...window,
        }),
    prisma.contact.count({ where }),
  ]);
  return { items: contacts.map((contact) => toApiContact(contact, fields)), total };
}

export async function listContacts(
  actor: Actor,
  query: ContactListQuery,
  filters: CustomFieldFilter[],
): Promise<Page<ApiContact>> {
  const fields = await listActiveCustomFields("CONTACT");
  return findContacts(actor, query, filters, fields, pageWindow(query));
}

// DATA-03: the list as a CSV file, for everyone who can see the list. The company is named
// only when it is one the caller may see, as in the list.
export async function exportContacts(
  actor: Actor,
  query: ContactExportQuery,
  filters: CustomFieldFilter[],
): Promise<CsvExport> {
  const fields = await listActiveCustomFields("CONTACT");
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiContact>[] = [
    { header: "First name", value: (contact) => contact.firstName },
    { header: "Last name", value: (contact) => contact.lastName },
    { header: "Job title", value: (contact) => contact.jobTitle },
    { header: "Email", value: (contact) => contact.email },
    { header: "Phone", value: (contact) => contact.phone },
    { header: "Company", value: (contact) => contact.company?.name ?? null },
    { header: "Owner", value: (contact) => contact.owner.name },
    { header: "Notes", value: (contact) => contact.notes },
    { header: "Last contact", value: (contact) => moment(contact.lastContactAt) },
    { header: "Created", value: (contact) => moment(contact.createdAt) },
    { header: "Updated", value: (contact) => moment(contact.updatedAt) },
    ...customFieldColumns<ApiContact>(fields),
  ];
  return buildCsvExport(columns, await findContacts(actor, query, filters, fields, exportWindow));
}

export async function getContact(actor: Actor, id: string): Promise<ApiContact> {
  return presentContact(await findContact(actor, id));
}

export async function createContact(actor: Actor, input: CreateContactBody): Promise<ApiContact> {
  assertCanWrite(actor);
  const { ownerId = actor.id, customFields: sent, ...fields } = input;
  await assertAssignable(actor, ownerId, "contacts");
  if (fields.companyId) {
    await assertCompanyVisible(actor, fields.companyId);
  }
  const customFields = customFieldsForCreate(await listActiveCustomFields("CONTACT"), sent);

  // Every change the timeline records is made in one transaction with its entry.
  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: { ...fields, customFields, ownerId, createdById: actor.id },
    });
    await addTimelineEntry(tx, {
      kind: "CREATED",
      authorId: actor.id,
      record: { type: "contact", id: created.id },
      occurredAt: created.createdAt,
    });
    return created;
  });
  return getContact(actor, contact.id);
}

// Editing a contact's details, its company included, is not history, so it writes no
// timeline entry.
export async function updateContact(
  actor: Actor,
  id: string,
  input: UpdateContactBody,
): Promise<ApiContact> {
  assertCanWrite(actor);
  const contact = await findContact(actor, id);
  if (input.companyId) {
    await assertCompanyVisible(actor, input.companyId);
  }
  const { customFields: sent, ...fields } = input;
  const customFields = await customFieldsForUpdate("CONTACT", contact.customFields, sent);
  await prisma.contact.update({ where: { id }, data: { ...fields, customFields } });
  return getContact(actor, id);
}

// The contact must be one the caller can see, and the new owner one they may assign to.
export async function assignContact(
  actor: Actor,
  id: string,
  ownerId: string,
): Promise<ApiContact> {
  assertCanReassign(actor);
  const contact = await findContact(actor, id);
  await assertAssignable(actor, ownerId, "contacts");
  // Assigning a contact to the owner it already has changes nothing, so it writes no entry.
  if (ownerId === contact.ownerId) {
    return presentContact(contact);
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.contact.update({
      where: { id },
      data: { ownerId },
      include: withOwner,
    });
    await addTimelineEntry(tx, {
      kind: "ASSIGNMENT",
      authorId: actor.id,
      record: { type: "contact", id },
      details: { fromOwner: contact.owner, toOwner: changed.owner },
    });
  });
  return getContact(actor, id);
}

// A soft delete: the row stays for history, and no response ever shows it again. Its
// opportunities stay, but no longer name a contact; both happen or neither does.
export async function deleteContact(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  await findContact(actor, id);
  await prisma.$transaction([
    prisma.opportunity.updateMany({ where: { contactId: id }, data: { contactId: null } }),
    prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
}
