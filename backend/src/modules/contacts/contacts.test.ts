import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type { Company, Contact, Prisma, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface ApiContact {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  company: { id: string; name: string } | null;
  notes: string | null;
  owner: { id: string; name: string };
  convertedFromLead: { id: string; name: string } | null;
  lastContactAt: string | null;
  customFields: Record<string, string | number | null>;
  createdAt: string;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const CONTACTS = "/api/v1/contacts";
const COMPANIES = "/api/v1/companies";

const app = createTestApp();

// Two teams: Meera manages Ravi, Omar manages Tara. Uma is a rep without a manager.
let admin: User;
let meera: User;
let ravi: User;
let omar: User;
let tara: User;
let uma: User;
let viewer: User;
let deactivated: User;

let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asViewer: Agent;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function contactOf(response: request.Response): ApiContact {
  return (response.body as Envelope<ApiContact>).data;
}

function contactsOf(response: request.Response): ApiContact[] {
  return (response.body as Envelope<ApiContact[]>).data;
}

function namesOf(response: request.Response): string[] {
  return contactsOf(response).map((contact) => contact.name);
}

function metaOf(response: request.Response) {
  return (response.body as Envelope<unknown>).meta;
}

let contactCount = 0;

// Straight into the database, so a test can start from any state. Each contact is created
// a minute after the one before, and ids follow creation order, so ties are predictable.
async function makeContact(
  owner: User,
  fields: Partial<Prisma.ContactUncheckedCreateInput> = {},
): Promise<Contact> {
  contactCount += 1;
  return prisma.contact.create({
    data: {
      id: `01920000-0000-7000-8000-${String(contactCount).padStart(12, "0")}`,
      firstName: "Contact",
      lastName: String(contactCount),
      ownerId: owner.id,
      createdById: owner.id,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, contactCount)),
      ...fields,
    },
  });
}

function makeCompany(owner: User, name: string): Promise<Company> {
  return prisma.company.create({ data: { name, ownerId: owner.id, createdById: owner.id } });
}

function stored(id: string): Promise<Contact> {
  return prisma.contact.findUniqueOrThrow({ where: { id } });
}

// The two ways to change an existing contact that share one rule (delete last).
function writesTo(agent: Agent, id: string) {
  return [
    ["update", () => agent.patch(`${CONTACTS}/${id}`).send({ jobTitle: "Changed" })],
    ["delete", () => agent.delete(`${CONTACTS}/${id}`)],
  ] as const;
}

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  omar = await createUser({ name: "Omar Manager", role: "SALES_MANAGER" });
  tara = await createUser({ name: "Tara Rep", role: "SALES_REP", managerId: omar.id });
  uma = await createUser({ name: "Uma Rep", role: "SALES_REP" });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });
  deactivated = await createUser({ name: "Dev Deactivated", role: "SALES_REP", isActive: false });

  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asViewer = await signInAs(app, viewer);
});

beforeEach(async () => {
  await resetRecords();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("who sees which contacts", () => {
  // One contact per possible owner.
  async function oneContactEach() {
    return {
      ofAdmin: await makeContact(admin, { firstName: "Of", lastName: "Admin" }),
      ofMeera: await makeContact(meera, { firstName: "Of", lastName: "Meera" }),
      ofRavi: await makeContact(ravi, { firstName: "Of", lastName: "Ravi" }),
      ofOmar: await makeContact(omar, { firstName: "Of", lastName: "Omar" }),
      ofTara: await makeContact(tara, { firstName: "Of", lastName: "Tara" }),
      ofUma: await makeContact(uma, { firstName: "Of", lastName: "Uma" }),
    };
  }

  const everyContact = ["Of Admin", "Of Meera", "Of Omar", "Of Ravi", "Of Tara", "Of Uma"];

  it.each([
    ["an Admin", () => asAdmin, everyContact],
    ["a Read-only user", () => asViewer, everyContact],
    ["a Sales Manager (own contacts and the team's)", () => asMeera, ["Of Meera", "Of Ravi"]],
    ["a Sales Rep (own contacts only)", () => asRavi, ["Of Ravi"]],
  ])("lists the right contacts for %s", async (_who, agent, expected) => {
    await oneContactEach();

    const response = await agent().get(CONTACTS);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(namesOf(response)).toEqual(expected);
    expect(metaOf(response)).toEqual({ page: 1, pageSize: 25, total: expected.length });
  });

  it("lets an Admin and a Read-only user read any contact", async () => {
    const { ofTara } = await oneContactEach();

    for (const agent of [asAdmin, asViewer]) {
      const response = await agent.get(`${CONTACTS}/${ofTara.id}`);
      expect(response.status).toBe(200);
      expect(contactOf(response).owner).toEqual({ id: tara.id, name: "Tara Rep" });
    }
  });

  it("lets a Sales Manager read their own and their team's contacts, and nobody else's", async () => {
    const contacts = await oneContactEach();

    expect((await asMeera.get(`${CONTACTS}/${contacts.ofMeera.id}`)).status).toBe(200);
    expect((await asMeera.get(`${CONTACTS}/${contacts.ofRavi.id}`)).status).toBe(200);
    for (const outside of [contacts.ofAdmin, contacts.ofOmar, contacts.ofTara, contacts.ofUma]) {
      const response = await asMeera.get(`${CONTACTS}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("lets a Sales Rep read only their own contacts, not even their manager's", async () => {
    const contacts = await oneContactEach();

    expect((await asRavi.get(`${CONTACTS}/${contacts.ofRavi.id}`)).status).toBe(200);
    for (const outside of [contacts.ofAdmin, contacts.ofMeera, contacts.ofTara, contacts.ofUma]) {
      const response = await asRavi.get(`${CONTACTS}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("answers a hidden contact exactly like one that does not exist", async () => {
    const { ofTara } = await oneContactEach();

    const hidden = await asRavi.get(`${CONTACTS}/${ofTara.id}`);
    const missing = await asRavi.get(`${CONTACTS}/${UNKNOWN_ID}`);

    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
  });
});

describe("create", () => {
  const body = { firstName: "Jane", lastName: "Doe" };

  it("creates a contact owned by the caller, in a company", async () => {
    const acme = await makeCompany(ravi, "Acme");

    const response = await asRavi.post(CONTACTS).send({
      ...body,
      jobTitle: "Buyer",
      email: "  Jane@Example.com ",
      phone: "+91 98765 43210",
      companyId: acme.id,
      notes: "Met at the fair",
    });
    const contact = contactOf(response);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(contact).toEqual({
      id: contact.id,
      firstName: "Jane",
      lastName: "Doe",
      name: "Jane Doe",
      jobTitle: "Buyer",
      email: "jane@example.com",
      phone: "+91 98765 43210",
      company: { id: acme.id, name: "Acme" },
      notes: "Met at the fair",
      owner: { id: ravi.id, name: "Ravi Rep" },
      convertedFromLead: null,
      lastContactAt: null,
      customFields: {},
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    });
    expect(await stored(contact.id)).toMatchObject({ createdById: ravi.id, companyId: acme.id });
  });

  it("stores an empty or missing optional field as null", async () => {
    const response = await asRavi
      .post(CONTACTS)
      .send({ ...body, jobTitle: "  ", email: "", companyId: null });

    expect(response.status).toBe(201);
    expect(contactOf(response)).toMatchObject({
      jobTitle: null,
      email: null,
      phone: null,
      company: null,
      notes: null,
    });
  });

  it("lets a Sales Rep create only for themselves", async () => {
    expect((await asRavi.post(CONTACTS).send({ ...body, ownerId: ravi.id })).status).toBe(201);

    for (const other of [meera, tara, admin]) {
      const response = await asRavi.post(CONTACTS).send({ ...body, ownerId: other.id });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect(await prisma.contact.count()).toBe(1);
  });

  it("lets a Sales Manager create for themselves and their team, not for another team", async () => {
    for (const owner of [meera, ravi]) {
      const response = await asMeera.post(CONTACTS).send({ ...body, ownerId: owner.id });
      expect(response.status).toBe(201);
      expect(contactOf(response).owner.id).toBe(owner.id);
    }

    for (const other of [tara, omar, admin, uma]) {
      const response = await asMeera.post(CONTACTS).send({ ...body, ownerId: other.id });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
  });

  it("lets an Admin create for any user who can own a contact", async () => {
    for (const owner of [admin, omar, tara, uma]) {
      const response = await asAdmin.post(CONTACTS).send({ ...body, ownerId: owner.id });
      expect(response.status).toBe(201);
      expect(contactOf(response).owner.id).toBe(owner.id);
    }
  });

  it("refuses an owner who is Read-only, deactivated or unknown", async () => {
    for (const ownerId of [viewer.id, deactivated.id, UNKNOWN_ID]) {
      const response = await asAdmin.post(CONTACTS).send({ ...body, ownerId });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect(await prisma.contact.count()).toBe(0);
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const response = await asViewer.post(CONTACTS).send(body);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.contact.count()).toBe(0);
  });

  it.each([
    ["a missing first name", { lastName: "Doe" }, "firstName"],
    ["an empty last name", { ...body, lastName: " " }, "lastName"],
    ["a first name over 100 characters", { ...body, firstName: "x".repeat(101) }, "firstName"],
    ["a job title over 100 characters", { ...body, jobTitle: "x".repeat(101) }, "jobTitle"],
    ["a bad email", { ...body, email: "not-an-email" }, "email"],
    ["a malformed company id", { ...body, companyId: "acme" }, "companyId"],
    ["an empty company id", { ...body, companyId: "" }, "companyId"],
    ["a malformed owner id", { ...body, ownerId: "me" }, "ownerId"],
    ["a company sent by name", { ...body, company: "Acme" }, ""],
    ["a last-contact date (the server sets it)", { ...body, lastContactAt: "2026-01-01" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const response = await asAdmin.post(CONTACTS).send(badBody);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.contact.count()).toBe(0);
  });
});

describe("the company of a contact", () => {
  const body = { firstName: "Jane", lastName: "Doe" };

  it("accepts a company the caller may see: own, the team's, or any for an Admin", async () => {
    const ofRavi = await makeCompany(ravi, "Of Ravi");
    const ofTara = await makeCompany(tara, "Of Tara");

    const byRep = await asRavi.post(CONTACTS).send({ ...body, companyId: ofRavi.id });
    const byManager = await asMeera.post(CONTACTS).send({ ...body, companyId: ofRavi.id });
    const byAdmin = await asAdmin.post(CONTACTS).send({ ...body, companyId: ofTara.id });

    expect([byRep.status, byManager.status, byAdmin.status]).toEqual([201, 201, 201]);
    expect(contactOf(byManager).company).toEqual({ id: ofRavi.id, name: "Of Ravi" });
    expect(contactOf(byAdmin).company).toEqual({ id: ofTara.id, name: "Of Tara" });
  });

  it("refuses, on create, a company the caller may not see, a deleted one and an unknown one", async () => {
    const ofTara = await makeCompany(tara, "Of Tara");
    const ofMeera = await makeCompany(meera, "Of Meera");
    const deleted = await makeCompany(ravi, "Deleted");
    await prisma.company.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const responses = [
      await asRavi.post(CONTACTS).send({ ...body, companyId: ofTara.id }),
      await asRavi.post(CONTACTS).send({ ...body, companyId: ofMeera.id }),
      await asMeera.post(CONTACTS).send({ ...body, companyId: ofTara.id }),
      await asRavi.post(CONTACTS).send({ ...body, companyId: deleted.id }),
      await asAdmin.post(CONTACTS).send({ ...body, companyId: deleted.id }),
      await asAdmin.post(CONTACTS).send({ ...body, companyId: UNKNOWN_ID }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["companyId"]);
    }
    // A hidden company and a missing one get the very same answer.
    expect(responses[0]?.body).toEqual(responses[5]?.body);
    expect(await prisma.contact.count()).toBe(0);
  });

  it("refuses the same companies on update, and leaves the contact as it was", async () => {
    const ofRavi = await makeCompany(ravi, "Of Ravi");
    const ofTara = await makeCompany(tara, "Of Tara");
    const contact = await makeContact(ravi, { companyId: ofRavi.id });

    for (const companyId of [ofTara.id, UNKNOWN_ID]) {
      const response = await asRavi.patch(`${CONTACTS}/${contact.id}`).send({ companyId });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["companyId"]);
    }
    expect((await stored(contact.id)).companyId).toBe(ofRavi.id);
  });

  it("moves a contact to another company and takes it out with companyId null", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const globex = await makeCompany(ravi, "Globex");
    const contact = await makeContact(ravi, { companyId: acme.id });

    const moved = await asRavi.patch(`${CONTACTS}/${contact.id}`).send({ companyId: globex.id });
    const untouched = await asRavi.patch(`${CONTACTS}/${contact.id}`).send({ jobTitle: "Buyer" });
    const unlinked = await asRavi.patch(`${CONTACTS}/${contact.id}`).send({ companyId: null });

    expect(contactOf(moved).company).toEqual({ id: globex.id, name: "Globex" });
    expect(contactOf(untouched).company).toEqual({ id: globex.id, name: "Globex" });
    expect(unlinked.status).toBe(200);
    expect(contactOf(unlinked).company).toBeNull();
    expect((await stored(contact.id)).companyId).toBeNull();
  });

  it("shows the company only to those who may see it", async () => {
    // Ravi's contact works at a company that Tara owns.
    const ofTara = await makeCompany(tara, "Of Tara");
    const contact = await makeContact(ravi, { companyId: ofTara.id });

    for (const agent of [asAdmin, asViewer]) {
      const one = await agent.get(`${CONTACTS}/${contact.id}`);
      const list = await agent.get(CONTACTS);
      expect(contactOf(one).company).toEqual({ id: ofTara.id, name: "Of Tara" });
      expect(contactsOf(list)[0]?.company).toEqual({ id: ofTara.id, name: "Of Tara" });
    }
    for (const agent of [asRavi, asMeera]) {
      const one = await agent.get(`${CONTACTS}/${contact.id}`);
      const list = await agent.get(CONTACTS);
      expect(one.status).toBe(200);
      expect(contactOf(one).company).toBeNull();
      expect(contactsOf(list)[0]?.company).toBeNull();
    }
  });

  it("does not reveal a hidden company through an update, a search or a filter", async () => {
    const ofTara = await makeCompany(tara, "Secret Corp");
    const contact = await makeContact(ravi, { companyId: ofTara.id });

    const updated = await asRavi.patch(`${CONTACTS}/${contact.id}`).send({ jobTitle: "Buyer" });
    const searched = await asRavi.get(CONTACTS).query({ search: "secret" });
    const filtered = await asRavi.get(CONTACTS).query({ companyId: ofTara.id });
    const forAdmin = await asAdmin.get(CONTACTS).query({ search: "secret" });

    expect(contactOf(updated).company).toBeNull();
    // The update did not unlink it either.
    expect((await stored(contact.id)).companyId).toBe(ofTara.id);
    expect(contactsOf(searched)).toEqual([]);
    expect(contactsOf(filtered)).toEqual([]);
    expect(contactsOf(forAdmin).map((item) => item.id)).toEqual([contact.id]);
  });

  it("shows no company once it is deleted, and the contact stays", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const contact = await makeContact(ravi, { companyId: acme.id });

    expect((await asRavi.delete(`${COMPANIES}/${acme.id}`)).status).toBe(200);

    for (const agent of [asRavi, asAdmin]) {
      const response = await agent.get(`${CONTACTS}/${contact.id}`);
      expect(response.status).toBe(200);
      expect(contactOf(response).company).toBeNull();
    }
    expect(contactsOf(await asAdmin.get(CONTACTS).query({ companyId: acme.id }))).toEqual([]);
    expect(contactsOf(await asAdmin.get(CONTACTS).query({ search: "acme" }))).toEqual([]);
  });

  it("never shows a deleted company, even one a contact still points at", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const contact = await makeContact(ravi, { companyId: acme.id });
    // Straight in the database, without the unlinking the API does.
    await prisma.company.update({ where: { id: acme.id }, data: { deletedAt: new Date() } });

    const one = await asAdmin.get(`${CONTACTS}/${contact.id}`);
    const bySearch = await asAdmin.get(CONTACTS).query({ search: "acme" });
    const byCompany = await asAdmin.get(CONTACTS).query({ companyId: acme.id });
    const sorted = await asAdmin.get(CONTACTS).query({ sort: "company" });

    expect(contactOf(one).company).toBeNull();
    expect(contactsOf(bySearch)).toEqual([]);
    expect(contactsOf(byCompany)).toEqual([]);
    expect(contactsOf(sorted).map((item) => item.company)).toEqual([null]);
  });
});

describe("update", () => {
  it("changes only the fields that were sent", async () => {
    const contact = await makeContact(ravi, { phone: "123", notes: "Keep me" });

    const response = await asRavi
      .patch(`${CONTACTS}/${contact.id}`)
      .send({ firstName: "Janet", jobTitle: "Buyer", email: "Janet@Example.com" });

    expect(response.status).toBe(200);
    expect(contactOf(response)).toMatchObject({
      firstName: "Janet",
      lastName: contact.lastName,
      name: `Janet ${contact.lastName}`,
      jobTitle: "Buyer",
      email: "janet@example.com",
      phone: "123",
      notes: "Keep me",
      owner: { id: ravi.id, name: "Ravi Rep" },
    });
  });

  it("clears a field that is sent as null or as an empty string", async () => {
    const contact = await makeContact(ravi, {
      jobTitle: "Buyer",
      email: "jane@example.com",
      phone: "123",
      notes: "Old",
    });

    const response = await asRavi
      .patch(`${CONTACTS}/${contact.id}`)
      .send({ jobTitle: "", email: null, phone: null, notes: " " });

    expect(response.status).toBe(200);
    expect(contactOf(response)).toMatchObject({
      jobTitle: null,
      email: null,
      phone: null,
      notes: null,
    });
  });

  it.each([
    ["an empty first name", { firstName: "" }, "firstName"],
    ["a last name sent as null", { lastName: null }, "lastName"],
    ["a bad email", { email: "nope" }, "email"],
    ["a malformed company id", { companyId: "acme" }, "companyId"],
    ["the owner (that is what assign is for)", { ownerId: UNKNOWN_ID }, ""],
    ["a last-contact date", { lastContactAt: null }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const contact = await makeContact(ravi, { firstName: "Jane" });

    const response = await asRavi.patch(`${CONTACTS}/${contact.id}`).send(badBody);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect((await stored(contact.id)).firstName).toBe("Jane");
  });
});

describe("who may change a contact (update, delete)", () => {
  it("lets an Admin change anyone's contact", async () => {
    const contact = await makeContact(tara);

    for (const [action, write] of writesTo(asAdmin, contact.id)) {
      expect((await write()).status, action).toBe(200);
    }
    expect((await stored(contact.id)).deletedAt).not.toBeNull();
  });

  it("lets a Sales Manager change their own and their team's contacts", async () => {
    for (const owner of [meera, ravi]) {
      const contact = await makeContact(owner);
      for (const [action, write] of writesTo(asMeera, contact.id)) {
        expect((await write()).status, `${action} ${owner.name}`).toBe(200);
      }
      expect((await stored(contact.id)).deletedAt).not.toBeNull();
    }
  });

  it("answers NOT_FOUND when a Sales Manager changes a contact outside their team", async () => {
    for (const owner of [tara, omar, admin, uma]) {
      const contact = await makeContact(owner);
      for (const [action, write] of writesTo(asMeera, contact.id)) {
        const response = await write();
        expect(response.status, `${action} ${owner.name}`).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
      }
      expect(await stored(contact.id)).toMatchObject({ jobTitle: null, deletedAt: null });
    }
  });

  it("lets a Sales Rep change their own contacts", async () => {
    const contact = await makeContact(ravi);

    for (const [action, write] of writesTo(asRavi, contact.id)) {
      expect((await write()).status, action).toBe(200);
    }
    expect((await stored(contact.id)).deletedAt).not.toBeNull();
  });

  it("answers NOT_FOUND when a Sales Rep changes someone else's contact", async () => {
    for (const owner of [meera, tara, admin]) {
      const contact = await makeContact(owner);
      for (const [action, write] of writesTo(asRavi, contact.id)) {
        const response = await write();
        expect(response.status, `${action} ${owner.name}`).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
      }
      expect(await stored(contact.id)).toMatchObject({ jobTitle: null, deletedAt: null });
    }
  });

  it("answers FORBIDDEN for every change by a Read-only user", async () => {
    const contact = await makeContact(ravi);

    for (const [action, write] of writesTo(asViewer, contact.id)) {
      const response = await write();
      expect(response.status, action).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await stored(contact.id)).toMatchObject({ jobTitle: null, deletedAt: null });
  });

  it("answers NOT_FOUND for a contact that does not exist", async () => {
    for (const [action, write] of writesTo(asAdmin, UNKNOWN_ID)) {
      const response = await write();
      expect(response.status, action).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });
});

describe("assign", () => {
  function assign(agent: Agent, contact: Contact, owner: { id: string }) {
    return agent.post(`${CONTACTS}/${contact.id}/assign`).send({ ownerId: owner.id });
  }

  it("lets an Admin give any contact to any user who can own one", async () => {
    const contact = await makeContact(ravi);

    for (const owner of [tara, omar, admin]) {
      const response = await assign(asAdmin, contact, owner);
      expect(response.status).toBe(200);
      expect(contactOf(response).owner).toEqual({ id: owner.id, name: owner.name });
    }
    expect((await stored(contact.id)).ownerId).toBe(admin.id);
  });

  it("lets a Sales Manager move a contact between themselves and their team", async () => {
    const contact = await makeContact(ravi);

    const toSelf = await assign(asMeera, contact, meera);
    const toRep = await assign(asMeera, contact, ravi);

    expect(toSelf.status).toBe(200);
    expect(contactOf(toSelf).owner.id).toBe(meera.id);
    expect(toRep.status).toBe(200);
    expect(contactOf(toRep).owner.id).toBe(ravi.id);
  });

  it("does not let a Sales Manager give a contact to someone outside their team", async () => {
    const contact = await makeContact(ravi);

    for (const owner of [tara, omar, admin, uma]) {
      const response = await assign(asMeera, contact, owner);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect((await stored(contact.id)).ownerId).toBe(ravi.id);
  });

  it("answers NOT_FOUND when a Sales Manager assigns a contact outside their team", async () => {
    const contact = await makeContact(tara);

    const response = await assign(asMeera, contact, ravi);

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
    expect((await stored(contact.id)).ownerId).toBe(tara.id);
  });

  it("answers FORBIDDEN for a Sales Rep, even on their own contact", async () => {
    const contact = await makeContact(ravi);

    const response = await assign(asRavi, contact, ravi);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const contact = await makeContact(ravi);

    const response = await assign(asViewer, contact, tara);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect((await stored(contact.id)).ownerId).toBe(ravi.id);
  });

  it("refuses a new owner who is Read-only, deactivated or unknown", async () => {
    const contact = await makeContact(ravi);

    for (const owner of [viewer, deactivated, { id: UNKNOWN_ID }]) {
      const response = await assign(asAdmin, contact, owner);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect((await stored(contact.id)).ownerId).toBe(ravi.id);
  });

  it("answers NOT_FOUND for a contact that does not exist", async () => {
    const response = await asAdmin
      .post(`${CONTACTS}/${UNKNOWN_ID}/assign`)
      .send({ ownerId: ravi.id });

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
  });

  it("keeps the contact in its company, which the new owner may not be able to see", async () => {
    const ofRavi = await makeCompany(ravi, "Of Ravi");
    const contact = await makeContact(ravi, { companyId: ofRavi.id });

    const response = await assign(asAdmin, contact, tara);

    expect(contactOf(response).company).toEqual({ id: ofRavi.id, name: "Of Ravi" });
    expect((await stored(contact.id)).companyId).toBe(ofRavi.id);
  });
});

describe("delete", () => {
  it("answers 200 with data null and keeps the row, marked as deleted", async () => {
    const contact = await makeContact(ravi);

    const response = await asRavi.delete(`${CONTACTS}/${contact.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect((await stored(contact.id)).deletedAt).toBeInstanceOf(Date);
  });

  it("never shows a deleted contact again, to anyone", async () => {
    const contact = await makeContact(ravi);
    const kept = await makeContact(ravi);
    await asRavi.delete(`${CONTACTS}/${contact.id}`);

    for (const agent of [asRavi, asMeera, asAdmin, asViewer]) {
      const list = await agent.get(CONTACTS);
      expect(contactsOf(list).map((item) => item.id)).toEqual([kept.id]);
      expect(metaOf(list).total).toBe(1);
      expect((await agent.get(`${CONTACTS}/${contact.id}`)).status).toBe(404);
    }
  });

  it("answers NOT_FOUND for every change to a deleted contact", async () => {
    const contact = await makeContact(ravi);
    await asAdmin.delete(`${CONTACTS}/${contact.id}`);

    for (const [action, write] of writesTo(asAdmin, contact.id)) {
      expect((await write()).status, action).toBe(404);
    }
    const assign = await asAdmin
      .post(`${CONTACTS}/${contact.id}/assign`)
      .send({ ownerId: tara.id });
    expect(assign.status).toBe(404);
    expect((await stored(contact.id)).ownerId).toBe(ravi.id);
  });

  it("leaves the contact's company alone", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const contact = await makeContact(ravi, { companyId: acme.id });

    await asRavi.delete(`${CONTACTS}/${contact.id}`);

    const company = await asRavi.get(`${COMPANIES}/${acme.id}`);
    expect(company.status).toBe(200);
    expect((company.body as Envelope<{ contactCount: number }>).data.contactCount).toBe(0);
  });
});

describe("list: search, filters, sorting and paging", () => {
  const A_TO_Z = ["Ann Zimmer", "Carlos Diaz", "Jane Doe", "Maria Janesson", "Zed Abel"];

  let acme: Company;
  let initech: Company;

  // Created oldest first: Ann, Carlos, Jane, Maria, Zed. Two work at Acme, one at Initech.
  async function sampleContacts() {
    acme = await makeCompany(ravi, "Acme Holdings");
    initech = await makeCompany(ravi, "Initech");
    await makeContact(ravi, {
      firstName: "Ann",
      lastName: "Zimmer",
      email: "ann@initech.test",
      companyId: initech.id,
    });
    await makeContact(ravi, {
      firstName: "Carlos",
      lastName: "Diaz",
      email: "carlos@mail.test",
      companyId: acme.id,
    });
    await makeContact(meera, { firstName: "Jane", lastName: "Doe", email: "jd@globex.test" });
    await makeContact(tara, { firstName: "Maria", lastName: "Janesson", companyId: acme.id });
    await makeContact(tara, { firstName: "Zed", lastName: "Abel", email: "zed@mail.test" });
  }

  function list(query: Record<string, string | number>, agent: Agent = asAdmin) {
    return agent.get(CONTACTS).query(query);
  }

  it("orders by name, A to Z, when nothing is asked for", async () => {
    await sampleContacts();

    expect(namesOf(await asAdmin.get(CONTACTS))).toEqual(A_TO_Z);
  });

  it.each([
    ["a first name", "carlos", ["Carlos Diaz"]],
    ["a last name", "ZIMMER", ["Ann Zimmer"]],
    ["part of a name", "jane", ["Jane Doe", "Maria Janesson"]],
    ["a full name", "jane doe", ["Jane Doe"]],
    ["an email", "globex.test", ["Jane Doe"]],
    ["a company name, whatever the case", "aCmE", ["Carlos Diaz", "Maria Janesson"]],
    ["company name or email", "initech", ["Ann Zimmer"]],
    ["words from different fields", "maria holdings", ["Maria Janesson"]],
    ["something nobody has", "nomatch", []],
    ["only spaces (no search)", "   ", A_TO_Z],
  ])("searches by %s", async (_what, search, expected) => {
    await sampleContacts();

    const response = await list({ search });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(expected);
    expect(metaOf(response).total).toBe(expected.length);
  });

  it("treats % and _ in a search as plain characters", async () => {
    await sampleContacts();
    await makeContact(ravi, { firstName: "Percy", lastName: "100%_Sign" });

    expect(namesOf(await list({ search: "%" }))).toEqual(["Percy 100%_Sign"]);
    expect(namesOf(await list({ search: "_" }))).toEqual(["Percy 100%_Sign"]);
    expect(namesOf(await list({ search: "\\" }))).toEqual([]);
  });

  it("filters by company", async () => {
    await sampleContacts();

    expect(namesOf(await list({ companyId: acme.id }))).toEqual(["Carlos Diaz", "Maria Janesson"]);
    expect(namesOf(await list({ companyId: initech.id }))).toEqual(["Ann Zimmer"]);
    expect(namesOf(await list({ companyId: UNKNOWN_ID }))).toEqual([]);
  });

  it("filters by owner", async () => {
    await sampleContacts();

    expect(namesOf(await list({ ownerId: tara.id }))).toEqual(["Maria Janesson", "Zed Abel"]);
    expect(namesOf(await list({ ownerId: uma.id }))).toEqual([]);
  });

  it("combines search and filters", async () => {
    await sampleContacts();

    const response = await list({ search: "mail", companyId: acme.id, ownerId: ravi.id });

    expect(namesOf(response)).toEqual(["Carlos Diaz"]);
  });

  it("never lets a filter widen what the caller may see", async () => {
    await sampleContacts();

    const asRep = await list({ ownerId: tara.id }, asRavi);
    const asManager = await list({ ownerId: tara.id }, asMeera);
    const searched = await list({ search: "zed" }, asRavi);

    for (const response of [asRep, asManager, searched]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    }
    // Maria works at Ravi's company but is Tara's contact.
    expect(namesOf(await list({ companyId: acme.id }, asRavi))).toEqual(["Carlos Diaz"]);
  });

  it.each([
    ["name", "asc", A_TO_Z],
    ["name", "desc", [...A_TO_Z].reverse()],
    // By company name, then by the contact's name; no company comes last either way.
    ["company", "asc", ["Carlos Diaz", "Maria Janesson", "Ann Zimmer", "Jane Doe", "Zed Abel"]],
    ["company", "desc", ["Ann Zimmer", "Maria Janesson", "Carlos Diaz", "Zed Abel", "Jane Doe"]],
    ["createdAt", "asc", A_TO_Z],
    ["createdAt", "desc", [...A_TO_Z].reverse()],
  ])("sorts by %s %s", async (sort, order, expected) => {
    await sampleContacts();

    const response = await list({ sort, order });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(expected);
    expect(metaOf(response).total).toBe(5);
  });

  it.each([
    [1, [["Carlos Diaz"], ["Maria Janesson"], ["Ann Zimmer"], ["Jane Doe"], ["Zed Abel"], []]],
    [2, [["Carlos Diaz", "Maria Janesson"], ["Ann Zimmer", "Jane Doe"], ["Zed Abel"], []]],
    [3, [["Carlos Diaz", "Maria Janesson", "Ann Zimmer"], ["Jane Doe", "Zed Abel"], []]],
    [4, [["Carlos Diaz", "Maria Janesson", "Ann Zimmer", "Jane Doe"], ["Zed Abel"], []]],
  ])(
    "pages through the company sort %s at a time without a gap or a repeat",
    async (pageSize, expected) => {
      await sampleContacts();

      const pages = [];
      for (let page = 1; page <= expected.length; page += 1) {
        const response = await list({ sort: "company", pageSize, page });
        expect(metaOf(response)).toEqual({ page, pageSize, total: 5 });
        pages.push(namesOf(response));
      }

      expect(pages).toEqual(expected);
    },
  );

  it("sorts a contact whose company the caller may not see with those that have none", async () => {
    const secret = await makeCompany(tara, "Aardvark Secret");
    const open = await makeCompany(ravi, "Open Corp");
    await makeContact(ravi, { firstName: "Hidden", lastName: "Company", companyId: secret.id });
    await makeContact(ravi, { firstName: "Open", lastName: "Company", companyId: open.id });
    await makeContact(ravi, { firstName: "No", lastName: "Company" });

    const forRep = await list({ sort: "company" }, asRavi);
    const forRepDesc = await list({ sort: "company", order: "desc" }, asRavi);
    const forAdmin = await list({ sort: "company" }, asAdmin);

    expect(namesOf(forRep)).toEqual(["Open Company", "Hidden Company", "No Company"]);
    expect(namesOf(forRepDesc)).toEqual(["Open Company", "No Company", "Hidden Company"]);
    expect(namesOf(forAdmin)).toEqual(["Hidden Company", "Open Company", "No Company"]);
    expect(metaOf(forRep).total).toBe(3);
  });

  it("sorts by updatedAt, so the contact changed last comes last or first", async () => {
    await sampleContacts();
    const jane = await prisma.contact.findFirstOrThrow({ where: { firstName: "Jane" } });
    await asAdmin.patch(`${CONTACTS}/${jane.id}`).send({ notes: "Called today" });

    const oldest = await list({ sort: "updatedAt" });
    const newest = await list({ sort: "updatedAt", order: "desc" });

    expect(namesOf(oldest)[4]).toBe("Jane Doe");
    expect(namesOf(newest)[0]).toBe("Jane Doe");
  });

  it("sorts by lastContactAt, with contacts never spoken to last in both directions", async () => {
    await sampleContacts();
    const day = (date: number) => new Date(Date.UTC(2026, 2, date));
    const setLastContact = (firstName: string, date: number) =>
      prisma.contact.updateMany({ where: { firstName }, data: { lastContactAt: day(date) } });
    await setLastContact("Carlos", 1);
    await setLastContact("Zed", 2);
    await setLastContact("Ann", 3);

    const oldest = await list({ sort: "lastContactAt" });
    const newest = await list({ sort: "lastContactAt", order: "desc" });

    // Jane and Maria were never spoken to; between themselves they follow the id.
    expect(namesOf(oldest)).toEqual([
      "Carlos Diaz",
      "Zed Abel",
      "Ann Zimmer",
      "Jane Doe",
      "Maria Janesson",
    ]);
    expect(namesOf(newest)).toEqual([
      "Ann Zimmer",
      "Zed Abel",
      "Carlos Diaz",
      "Maria Janesson",
      "Jane Doe",
    ]);
    expect(contactsOf(newest)[0]?.lastContactAt).toBe("2026-03-03T00:00:00.000Z");
    expect(contactsOf(newest)[4]?.lastContactAt).toBeNull();
  });

  it("pages through the list and reports the total", async () => {
    await sampleContacts();

    const first = await list({ pageSize: 2 });
    const second = await list({ pageSize: 2, page: 2 });
    const third = await list({ pageSize: 2, page: 3 });
    const beyond = await list({ pageSize: 2, page: 4 });

    expect(namesOf(first)).toEqual(["Ann Zimmer", "Carlos Diaz"]);
    expect(namesOf(second)).toEqual(["Jane Doe", "Maria Janesson"]);
    expect(namesOf(third)).toEqual(["Zed Abel"]);
    expect(namesOf(beyond)).toEqual([]);
    expect(metaOf(first)).toEqual({ page: 1, pageSize: 2, total: 5 });
    expect(metaOf(third)).toEqual({ page: 3, pageSize: 2, total: 5 });
    expect(metaOf(beyond)).toEqual({ page: 4, pageSize: 2, total: 5 });
  });

  it("counts only the matches, and only the contacts the caller may see, in total", async () => {
    await sampleContacts();

    const filtered = await list({ companyId: acme.id, pageSize: 1 });
    const scoped = await list({ pageSize: 1 }, asMeera);

    expect(metaOf(filtered)).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(metaOf(scoped)).toEqual({ page: 1, pageSize: 1, total: 3 });
  });

  it("gives every contact exactly one place when the sorted values are equal", async () => {
    const same = await makeCompany(ravi, "Same");
    for (let index = 0; index < 5; index += 1) {
      await makeContact(ravi, {
        firstName: "Same",
        lastName: "Name",
        companyId: index < 3 ? same.id : null,
      });
    }

    for (const sort of ["name", "company", "lastContactAt"]) {
      const pages = await Promise.all([1, 2, 3].map((page) => list({ sort, pageSize: 2, page })));
      const ids = pages.flatMap((page) => contactsOf(page).map((contact) => contact.id));
      expect(new Set(ids).size, sort).toBe(5);
    }
  });

  it("accepts the largest page size", async () => {
    const response = await list({ pageSize: 100 });

    expect(response.status).toBe(200);
    expect(metaOf(response)).toEqual({ page: 1, pageSize: 100, total: 0 });
  });

  it.each([
    ["page", "0"],
    ["page", "1.5"],
    ["pageSize", "0"],
    ["pageSize", "101"],
    ["sort", "owner"],
    ["sort", "status"],
    ["order", "up"],
    ["companyId", "acme"],
    ["ownerId", "me"],
    ["search", "x".repeat(101)],
  ])("answers VALIDATION_FAILED for %s=%s", async (key, value) => {
    const response = await list({ [key]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([key]);
  });
});
