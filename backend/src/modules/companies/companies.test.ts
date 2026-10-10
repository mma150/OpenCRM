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
import type { Company, Prisma, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface ApiCompany {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  owner: { id: string; name: string };
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const COMPANIES = "/api/v1/companies";
const INDUSTRIES = "/api/v1/companies/industries";

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

function companyOf(response: request.Response): ApiCompany {
  return (response.body as Envelope<ApiCompany>).data;
}

function companiesOf(response: request.Response): ApiCompany[] {
  return (response.body as Envelope<ApiCompany[]>).data;
}

function namesOf(response: request.Response): string[] {
  return companiesOf(response).map((company) => company.name);
}

function metaOf(response: request.Response) {
  return (response.body as Envelope<unknown>).meta;
}

let companyCount = 0;

// Straight into the database, so a test can start from any state. Each company is created
// a minute after the one before, and ids follow creation order, so ties are predictable.
async function makeCompany(
  owner: User,
  fields: Partial<Prisma.CompanyUncheckedCreateInput> = {},
): Promise<Company> {
  companyCount += 1;
  return prisma.company.create({
    data: {
      id: `01920000-0000-7000-8000-${String(companyCount).padStart(12, "0")}`,
      name: `Company ${String(companyCount)}`,
      ownerId: owner.id,
      createdById: owner.id,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, companyCount)),
      ...fields,
    },
  });
}

function makeContact(
  owner: User,
  company: Company | null,
  fields: Partial<Prisma.ContactUncheckedCreateInput> = {},
) {
  return prisma.contact.create({
    data: {
      firstName: "Contact",
      lastName: "One",
      ownerId: owner.id,
      createdById: owner.id,
      companyId: company?.id ?? null,
      ...fields,
    },
  });
}

function stored(id: string): Promise<Company> {
  return prisma.company.findUniqueOrThrow({ where: { id } });
}

// The two ways to change an existing company that share one rule (delete last).
function writesTo(agent: Agent, id: string) {
  return [
    ["update", () => agent.patch(`${COMPANIES}/${id}`).send({ industry: "Changed" })],
    ["delete", () => agent.delete(`${COMPANIES}/${id}`)],
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

describe("who sees which companies", () => {
  // One company per possible owner.
  async function oneCompanyEach() {
    return {
      ofAdmin: await makeCompany(admin, { name: "Of Admin" }),
      ofMeera: await makeCompany(meera, { name: "Of Meera" }),
      ofRavi: await makeCompany(ravi, { name: "Of Ravi" }),
      ofOmar: await makeCompany(omar, { name: "Of Omar" }),
      ofTara: await makeCompany(tara, { name: "Of Tara" }),
      ofUma: await makeCompany(uma, { name: "Of Uma" }),
    };
  }

  const everyCompany = ["Of Admin", "Of Meera", "Of Omar", "Of Ravi", "Of Tara", "Of Uma"];

  it.each([
    ["an Admin", () => asAdmin, everyCompany],
    ["a Read-only user", () => asViewer, everyCompany],
    ["a Sales Manager (own companies and the team's)", () => asMeera, ["Of Meera", "Of Ravi"]],
    ["a Sales Rep (own companies only)", () => asRavi, ["Of Ravi"]],
  ])("lists the right companies for %s", async (_who, agent, expected) => {
    await oneCompanyEach();

    const response = await agent().get(COMPANIES);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(namesOf(response)).toEqual(expected);
    expect(metaOf(response)).toEqual({ page: 1, pageSize: 25, total: expected.length });
  });

  it("lets an Admin and a Read-only user read any company", async () => {
    const { ofTara } = await oneCompanyEach();

    for (const agent of [asAdmin, asViewer]) {
      const response = await agent.get(`${COMPANIES}/${ofTara.id}`);
      expect(response.status).toBe(200);
      expect(companyOf(response).owner).toEqual({ id: tara.id, name: "Tara Rep" });
    }
  });

  it("lets a Sales Manager read their own and their team's companies, and nobody else's", async () => {
    const companies = await oneCompanyEach();

    expect((await asMeera.get(`${COMPANIES}/${companies.ofMeera.id}`)).status).toBe(200);
    expect((await asMeera.get(`${COMPANIES}/${companies.ofRavi.id}`)).status).toBe(200);
    for (const outside of [
      companies.ofAdmin,
      companies.ofOmar,
      companies.ofTara,
      companies.ofUma,
    ]) {
      const response = await asMeera.get(`${COMPANIES}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("lets a Sales Rep read only their own companies, not even their manager's", async () => {
    const companies = await oneCompanyEach();

    expect((await asRavi.get(`${COMPANIES}/${companies.ofRavi.id}`)).status).toBe(200);
    for (const outside of [
      companies.ofAdmin,
      companies.ofMeera,
      companies.ofTara,
      companies.ofUma,
    ]) {
      const response = await asRavi.get(`${COMPANIES}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("answers a hidden company exactly like one that does not exist", async () => {
    const { ofTara } = await oneCompanyEach();

    const hidden = await asRavi.get(`${COMPANIES}/${ofTara.id}`);
    const missing = await asRavi.get(`${COMPANIES}/${UNKNOWN_ID}`);

    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
  });
});

describe("create", () => {
  const body = { name: "Acme" };

  it("creates a company owned by the caller", async () => {
    const response = await asRavi.post(COMPANIES).send({
      name: "  Acme Holdings ",
      website: "https://acme.example/about",
      industry: "Retail",
      phone: "+91 98765 43210",
      address: "1 Market Road, Pune",
      notes: "Met at the fair",
    });
    const company = companyOf(response);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(company).toEqual({
      id: company.id,
      name: "Acme Holdings",
      website: "https://acme.example/about",
      industry: "Retail",
      phone: "+91 98765 43210",
      address: "1 Market Road, Pune",
      notes: "Met at the fair",
      owner: { id: ravi.id, name: "Ravi Rep" },
      contactCount: 0,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    });
    expect((await stored(company.id)).createdById).toBe(ravi.id);
  });

  it("stores an empty or missing optional field as null", async () => {
    const response = await asRavi.post(COMPANIES).send({ ...body, website: "", industry: "  " });

    expect(response.status).toBe(201);
    expect(companyOf(response)).toMatchObject({
      website: null,
      industry: null,
      phone: null,
      address: null,
      notes: null,
    });
  });

  it.each([
    "acme.example",
    "www.acme.example/shop?x=1",
    "http://acme.example",
    "HTTPS://Acme.Example",
  ])("accepts the website %s", async (website) => {
    const response = await asRavi.post(COMPANIES).send({ ...body, website });

    expect(response.status).toBe(201);
    expect(companyOf(response).website).toBe(website);
  });

  it("lets a Sales Rep create only for themselves", async () => {
    expect((await asRavi.post(COMPANIES).send({ ...body, ownerId: ravi.id })).status).toBe(201);

    for (const other of [meera, tara, admin]) {
      const response = await asRavi.post(COMPANIES).send({ ...body, ownerId: other.id });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect(await prisma.company.count()).toBe(1);
  });

  it("lets a Sales Manager create for themselves and their team, not for another team", async () => {
    for (const owner of [meera, ravi]) {
      const response = await asMeera.post(COMPANIES).send({ ...body, ownerId: owner.id });
      expect(response.status).toBe(201);
      expect(companyOf(response).owner.id).toBe(owner.id);
    }

    for (const other of [tara, omar, admin, uma]) {
      const response = await asMeera.post(COMPANIES).send({ ...body, ownerId: other.id });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
  });

  it("lets an Admin create for any user who can own a company", async () => {
    for (const owner of [admin, omar, tara, uma]) {
      const response = await asAdmin.post(COMPANIES).send({ ...body, ownerId: owner.id });
      expect(response.status).toBe(201);
      expect(companyOf(response).owner.id).toBe(owner.id);
    }
  });

  it("refuses an owner who is Read-only, deactivated or unknown", async () => {
    for (const ownerId of [viewer.id, deactivated.id, UNKNOWN_ID]) {
      const response = await asAdmin.post(COMPANIES).send({ ...body, ownerId });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect(await prisma.company.count()).toBe(0);
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const response = await asViewer.post(COMPANIES).send(body);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.company.count()).toBe(0);
  });

  it.each([
    ["a missing name", {}, "name"],
    ["an empty name", { name: "  " }, "name"],
    ["a name over 200 characters", { name: "x".repeat(201) }, "name"],
    ["an industry over 100 characters", { ...body, industry: "x".repeat(101) }, "industry"],
    ["an address over 500 characters", { ...body, address: "x".repeat(501) }, "address"],
    ["a website that is a script", { ...body, website: "javascript:alert(1)" }, "website"],
    ["a website with another scheme", { ...body, website: "ftp://acme.example" }, "website"],
    ["a website with a space", { ...body, website: "acme example.com" }, "website"],
    ["a website that is one word", { ...body, website: "acme" }, "website"],
    ["a phone sent as a number", { ...body, phone: 123 }, "phone"],
    ["a malformed owner id", { ...body, ownerId: "me" }, "ownerId"],
    ["a field the route does not offer", { ...body, contactCount: 5 }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const response = await asAdmin.post(COMPANIES).send(badBody);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.company.count()).toBe(0);
  });

  it("accepts the longest values", async () => {
    const response = await asAdmin.post(COMPANIES).send({
      name: "x".repeat(200),
      industry: "x".repeat(100),
      address: "x".repeat(500),
    });

    expect(response.status).toBe(201);
  });
});

describe("update", () => {
  it("changes only the fields that were sent", async () => {
    const company = await makeCompany(ravi, { name: "Acme", phone: "123", notes: "Keep me" });

    const response = await asRavi
      .patch(`${COMPANIES}/${company.id}`)
      .send({ name: "Acme Ltd", industry: "Retail" });

    expect(response.status).toBe(200);
    expect(companyOf(response)).toMatchObject({
      name: "Acme Ltd",
      industry: "Retail",
      phone: "123",
      notes: "Keep me",
      owner: { id: ravi.id, name: "Ravi Rep" },
    });
  });

  it("clears a field that is sent as null or as an empty string", async () => {
    const company = await makeCompany(ravi, {
      website: "acme.example",
      industry: "Retail",
      phone: "123",
      address: "Pune",
      notes: "Old",
    });

    const response = await asRavi
      .patch(`${COMPANIES}/${company.id}`)
      .send({ website: null, industry: "", phone: null, address: " ", notes: null });

    expect(response.status).toBe(200);
    expect(companyOf(response)).toMatchObject({
      website: null,
      industry: null,
      phone: null,
      address: null,
      notes: null,
    });
  });

  it.each([
    ["an empty name", { name: "" }, "name"],
    ["a name sent as null", { name: null }, "name"],
    ["a bad website", { website: "javascript:alert(1)" }, "website"],
    ["the owner (that is what assign is for)", { ownerId: UNKNOWN_ID }, ""],
    ["an unknown key", { deletedAt: null }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const company = await makeCompany(ravi, { name: "Acme" });

    const response = await asRavi.patch(`${COMPANIES}/${company.id}`).send(badBody);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect((await stored(company.id)).name).toBe("Acme");
  });
});

describe("who may change a company (update, delete)", () => {
  it("lets an Admin change anyone's company", async () => {
    const company = await makeCompany(tara);

    for (const [action, write] of writesTo(asAdmin, company.id)) {
      expect((await write()).status, action).toBe(200);
    }
    expect((await stored(company.id)).deletedAt).not.toBeNull();
  });

  it("lets a Sales Manager change their own and their team's companies", async () => {
    for (const owner of [meera, ravi]) {
      const company = await makeCompany(owner);
      for (const [action, write] of writesTo(asMeera, company.id)) {
        expect((await write()).status, `${action} ${owner.name}`).toBe(200);
      }
      expect((await stored(company.id)).deletedAt).not.toBeNull();
    }
  });

  it("answers NOT_FOUND when a Sales Manager changes a company outside their team", async () => {
    for (const owner of [tara, omar, admin, uma]) {
      const company = await makeCompany(owner);
      for (const [action, write] of writesTo(asMeera, company.id)) {
        const response = await write();
        expect(response.status, `${action} ${owner.name}`).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
      }
      expect(await stored(company.id)).toMatchObject({ industry: null, deletedAt: null });
    }
  });

  it("lets a Sales Rep change their own companies", async () => {
    const company = await makeCompany(ravi);

    for (const [action, write] of writesTo(asRavi, company.id)) {
      expect((await write()).status, action).toBe(200);
    }
    expect((await stored(company.id)).deletedAt).not.toBeNull();
  });

  it("answers NOT_FOUND when a Sales Rep changes someone else's company", async () => {
    for (const owner of [meera, tara, admin]) {
      const company = await makeCompany(owner);
      for (const [action, write] of writesTo(asRavi, company.id)) {
        const response = await write();
        expect(response.status, `${action} ${owner.name}`).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
      }
      expect(await stored(company.id)).toMatchObject({ industry: null, deletedAt: null });
    }
  });

  it("answers FORBIDDEN for every change by a Read-only user", async () => {
    const company = await makeCompany(ravi);

    for (const [action, write] of writesTo(asViewer, company.id)) {
      const response = await write();
      expect(response.status, action).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await stored(company.id)).toMatchObject({ industry: null, deletedAt: null });
  });

  it("answers NOT_FOUND for a company that does not exist", async () => {
    for (const [action, write] of writesTo(asAdmin, UNKNOWN_ID)) {
      const response = await write();
      expect(response.status, action).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });
});

describe("assign", () => {
  function assign(agent: Agent, company: Company, owner: { id: string }) {
    return agent.post(`${COMPANIES}/${company.id}/assign`).send({ ownerId: owner.id });
  }

  it("lets an Admin give any company to any user who can own one", async () => {
    const company = await makeCompany(ravi);

    for (const owner of [tara, omar, admin]) {
      const response = await assign(asAdmin, company, owner);
      expect(response.status).toBe(200);
      expect(companyOf(response).owner).toEqual({ id: owner.id, name: owner.name });
    }
    expect((await stored(company.id)).ownerId).toBe(admin.id);
  });

  it("lets a Sales Manager move a company between themselves and their team", async () => {
    const company = await makeCompany(ravi);

    const toSelf = await assign(asMeera, company, meera);
    const toRep = await assign(asMeera, company, ravi);

    expect(toSelf.status).toBe(200);
    expect(companyOf(toSelf).owner.id).toBe(meera.id);
    expect(toRep.status).toBe(200);
    expect(companyOf(toRep).owner.id).toBe(ravi.id);
  });

  it("does not let a Sales Manager give a company to someone outside their team", async () => {
    const company = await makeCompany(ravi);

    for (const owner of [tara, omar, admin, uma]) {
      const response = await assign(asMeera, company, owner);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect((await stored(company.id)).ownerId).toBe(ravi.id);
  });

  it("answers NOT_FOUND when a Sales Manager assigns a company outside their team", async () => {
    const company = await makeCompany(tara);

    const response = await assign(asMeera, company, ravi);

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
    expect((await stored(company.id)).ownerId).toBe(tara.id);
  });

  it("answers FORBIDDEN for a Sales Rep, even on their own company", async () => {
    const company = await makeCompany(ravi);

    const response = await assign(asRavi, company, ravi);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const company = await makeCompany(ravi);

    const response = await assign(asViewer, company, tara);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect((await stored(company.id)).ownerId).toBe(ravi.id);
  });

  it("refuses a new owner who is Read-only, deactivated or unknown", async () => {
    const company = await makeCompany(ravi);

    for (const owner of [viewer, deactivated, { id: UNKNOWN_ID }]) {
      const response = await assign(asAdmin, company, owner);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect((await stored(company.id)).ownerId).toBe(ravi.id);
  });

  it("answers NOT_FOUND for a company that does not exist", async () => {
    const response = await asAdmin
      .post(`${COMPANIES}/${UNKNOWN_ID}/assign`)
      .send({ ownerId: ravi.id });

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
  });

  it("leaves the company's contacts with their own owners", async () => {
    const company = await makeCompany(ravi);
    const contact = await makeContact(ravi, company);

    await assign(asAdmin, company, tara);

    expect(await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).toMatchObject({
      ownerId: ravi.id,
      companyId: company.id,
    });
  });
});

describe("delete", () => {
  it("answers 200 with data null and keeps the row, marked as deleted", async () => {
    const company = await makeCompany(ravi);

    const response = await asRavi.delete(`${COMPANIES}/${company.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect((await stored(company.id)).deletedAt).toBeInstanceOf(Date);
  });

  it("never shows a deleted company again, to anyone", async () => {
    const company = await makeCompany(ravi, { industry: "Gone" });
    const kept = await makeCompany(ravi, { industry: "Kept" });
    await asRavi.delete(`${COMPANIES}/${company.id}`);

    for (const agent of [asRavi, asMeera, asAdmin, asViewer]) {
      const list = await agent.get(COMPANIES);
      expect(companiesOf(list).map((item) => item.id)).toEqual([kept.id]);
      expect(metaOf(list).total).toBe(1);
      expect((await agent.get(`${COMPANIES}/${company.id}`)).status).toBe(404);
      expect((await agent.get(INDUSTRIES)).body).toEqual({ data: ["Kept"], meta: {} });
    }
  });

  it("answers NOT_FOUND for every change to a deleted company", async () => {
    const company = await makeCompany(ravi);
    await asAdmin.delete(`${COMPANIES}/${company.id}`);

    for (const [action, write] of writesTo(asAdmin, company.id)) {
      expect((await write()).status, action).toBe(404);
    }
    const assign = await asAdmin
      .post(`${COMPANIES}/${company.id}/assign`)
      .send({ ownerId: tara.id });
    expect(assign.status).toBe(404);
    expect((await stored(company.id)).ownerId).toBe(ravi.id);
  });

  it("keeps the company's contacts and takes them out of the company", async () => {
    const company = await makeCompany(ravi);
    const other = await makeCompany(ravi);
    const mine = await makeContact(ravi, company);
    // A contact the caller cannot see is unlinked too: the company is gone for everyone.
    const someoneElses = await makeContact(tara, company);
    const elsewhere = await makeContact(ravi, other);

    const response = await asRavi.delete(`${COMPANIES}/${company.id}`);

    expect(response.status).toBe(200);
    const contacts = await prisma.contact.findMany({ orderBy: { createdAt: "asc" } });
    expect(contacts.map(({ id, companyId, deletedAt }) => ({ id, companyId, deletedAt }))).toEqual([
      { id: mine.id, companyId: null, deletedAt: null },
      { id: someoneElses.id, companyId: null, deletedAt: null },
      { id: elsewhere.id, companyId: other.id, deletedAt: null },
    ]);
  });

  it("does not touch the contacts when the delete is refused", async () => {
    const company = await makeCompany(tara);
    const contact = await makeContact(tara, company);

    expect((await asRavi.delete(`${COMPANIES}/${company.id}`)).status).toBe(404);
    expect((await asViewer.delete(`${COMPANIES}/${company.id}`)).status).toBe(403);

    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).companyId).toBe(
      company.id,
    );
  });
});

describe("contactCount", () => {
  it("counts the live contacts linked to the company", async () => {
    const company = await makeCompany(ravi);
    const other = await makeCompany(ravi);
    await makeContact(ravi, company);
    await makeContact(ravi, company);
    await makeContact(ravi, company, { deletedAt: new Date() });
    await makeContact(ravi, other);
    await makeContact(ravi, null);

    const one = await asRavi.get(`${COMPANIES}/${company.id}`);
    const list = await asRavi.get(COMPANIES);

    expect(companyOf(one).contactCount).toBe(2);
    expect(companiesOf(list).map((item) => item.contactCount)).toEqual([2, 1]);
  });

  it("counts only the contacts the caller may see", async () => {
    const company = await makeCompany(ravi);
    await makeContact(ravi, company);
    await makeContact(meera, company);
    await makeContact(tara, company);

    const counts = [];
    for (const agent of [asAdmin, asViewer, asMeera, asRavi]) {
      counts.push(companyOf(await agent.get(`${COMPANIES}/${company.id}`)).contactCount);
    }

    expect(counts).toEqual([3, 3, 2, 1]);
  });

  it("is in the answer to an update and an assign too", async () => {
    const company = await makeCompany(ravi);
    await makeContact(ravi, company);

    const updated = await asMeera.patch(`${COMPANIES}/${company.id}`).send({ notes: "Hello" });
    const assigned = await asMeera
      .post(`${COMPANIES}/${company.id}/assign`)
      .send({ ownerId: meera.id });

    expect(companyOf(updated).contactCount).toBe(1);
    expect(companyOf(assigned).contactCount).toBe(1);
  });
});

describe("GET /companies/industries", () => {
  it("answers the industries in use, once each, A to Z", async () => {
    await makeCompany(ravi, { industry: "Retail" });
    await makeCompany(ravi, { industry: "banking" });
    await makeCompany(tara, { industry: "Retail" });
    await makeCompany(tara, { industry: "Aviation" });
    await makeCompany(tara, { industry: null });

    const response = await asAdmin.get(INDUSTRIES);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: ["Aviation", "banking", "Retail"], meta: {} });
  });

  it("treats two spellings that differ only in case as one industry", async () => {
    await makeCompany(ravi, { industry: "Retail" });
    await makeCompany(ravi, { industry: "RETAIL" });
    await makeCompany(ravi, { industry: "retail" });

    const { data } = (await asAdmin.get(INDUSTRIES)).body as Envelope<string[]>;

    expect(data).toHaveLength(1);
    expect(data[0]?.toLowerCase()).toBe("retail");
  });

  it("answers only the industries of companies the caller may see", async () => {
    await makeCompany(ravi, { industry: "Retail" });
    await makeCompany(meera, { industry: "Banking" });
    await makeCompany(tara, { industry: "Aviation" });

    const forRep = (await asRavi.get(INDUSTRIES)).body as Envelope<string[]>;
    const forManager = (await asMeera.get(INDUSTRIES)).body as Envelope<string[]>;
    const forViewer = (await asViewer.get(INDUSTRIES)).body as Envelope<string[]>;

    expect(forRep.data).toEqual(["Retail"]);
    expect(forManager.data).toEqual(["Banking", "Retail"]);
    expect(forViewer.data).toEqual(["Aviation", "Banking", "Retail"]);
  });

  it("answers an empty list when there are none", async () => {
    await makeCompany(ravi);

    expect((await asRavi.get(INDUSTRIES)).body).toEqual({ data: [], meta: {} });
  });
});

describe("list: search, filters, sorting and paging", () => {
  const A_TO_Z = ["Acme Holdings", "Globex", "Initech", "Umbrella", "Zenith"];

  // Created oldest first: Initech, Zenith, Acme Holdings, Umbrella, Globex.
  async function sampleCompanies() {
    await makeCompany(ravi, {
      name: "Initech",
      website: "initech.test",
      industry: "Software",
    });
    await makeCompany(ravi, { name: "Zenith", website: "zenith.test", industry: "Retail" });
    await makeCompany(meera, {
      name: "Acme Holdings",
      website: "www.holdings.test",
      industry: "Retail",
    });
    await makeCompany(tara, { name: "Umbrella", website: null, industry: null });
    await makeCompany(tara, { name: "Globex", website: "globex.test", industry: "Aviation" });
  }

  function list(query: Record<string, string | number>, agent: Agent = asAdmin) {
    return agent.get(COMPANIES).query(query);
  }

  it("orders by name, A to Z, when nothing is asked for", async () => {
    await sampleCompanies();

    expect(namesOf(await asAdmin.get(COMPANIES))).toEqual(A_TO_Z);
  });

  it.each([
    ["a name", "globex", ["Globex"]],
    ["part of a name, whatever the case", "ENIT", ["Zenith"]],
    ["a website", "holdings.test", ["Acme Holdings"]],
    ["an industry", "retail", ["Acme Holdings", "Zenith"]],
    ["words from different fields", "acme retail", ["Acme Holdings"]],
    ["something nobody has", "nomatch", []],
    ["only spaces (no search)", "   ", A_TO_Z],
  ])("searches by %s", async (_what, search, expected) => {
    await sampleCompanies();

    const response = await list({ search });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(expected);
    expect(metaOf(response).total).toBe(expected.length);
  });

  it("treats % and _ in a search as plain characters", async () => {
    await sampleCompanies();
    await makeCompany(ravi, { name: "100% Juice_Co" });

    expect(namesOf(await list({ search: "%" }))).toEqual(["100% Juice_Co"]);
    expect(namesOf(await list({ search: "_" }))).toEqual(["100% Juice_Co"]);
    expect(namesOf(await list({ search: "\\" }))).toEqual([]);
  });

  it("filters by the whole industry, whatever the case", async () => {
    await sampleCompanies();

    expect(namesOf(await list({ industry: "Retail" }))).toEqual(["Acme Holdings", "Zenith"]);
    expect(namesOf(await list({ industry: "RETAIL" }))).toEqual(["Acme Holdings", "Zenith"]);
    expect(namesOf(await list({ industry: "Aviation" }))).toEqual(["Globex"]);
    expect(namesOf(await list({ industry: "Retai" }))).toEqual([]);
    expect(namesOf(await list({ industry: "Mining" }))).toEqual([]);
  });

  it("treats % and _ in the industry filter as plain characters", async () => {
    await makeCompany(ravi, { name: "Plain", industry: "R&D" });
    await makeCompany(ravi, { name: "Odd", industry: "R_D" });

    expect(namesOf(await list({ industry: "R_D" }))).toEqual(["Odd"]);
    expect(namesOf(await list({ industry: "%" }))).toEqual([]);
  });

  it("filters by owner", async () => {
    await sampleCompanies();

    expect(namesOf(await list({ ownerId: tara.id }))).toEqual(["Globex", "Umbrella"]);
    expect(namesOf(await list({ ownerId: uma.id }))).toEqual([]);
  });

  it("combines search and filters", async () => {
    await sampleCompanies();

    const response = await list({ search: "test", industry: "retail", ownerId: ravi.id });

    expect(namesOf(response)).toEqual(["Zenith"]);
  });

  it("never lets a filter widen what the caller may see", async () => {
    await sampleCompanies();

    const asRep = await list({ ownerId: tara.id }, asRavi);
    const asManager = await list({ ownerId: tara.id }, asMeera);
    const searched = await list({ search: "umbrella" }, asRavi);
    const byIndustry = await list({ industry: "Aviation" }, asMeera);

    for (const response of [asRep, asManager, searched, byIndustry]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    }
  });

  it.each([
    ["name", "asc", A_TO_Z],
    ["name", "desc", [...A_TO_Z].reverse()],
    // A company without an industry comes last either way; equal industries follow the id.
    ["industry", "asc", ["Globex", "Zenith", "Acme Holdings", "Initech", "Umbrella"]],
    ["industry", "desc", ["Initech", "Acme Holdings", "Zenith", "Globex", "Umbrella"]],
    ["createdAt", "asc", ["Initech", "Zenith", "Acme Holdings", "Umbrella", "Globex"]],
    ["createdAt", "desc", ["Globex", "Umbrella", "Acme Holdings", "Zenith", "Initech"]],
  ])("sorts by %s %s", async (sort, order, expected) => {
    await sampleCompanies();

    const response = await list({ sort, order });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(expected);
  });

  it("sorts by updatedAt, so the company changed last comes last or first", async () => {
    await sampleCompanies();
    const initech = await prisma.company.findFirstOrThrow({ where: { name: "Initech" } });
    await asAdmin.patch(`${COMPANIES}/${initech.id}`).send({ notes: "Called today" });

    const oldest = await list({ sort: "updatedAt" });
    const newest = await list({ sort: "updatedAt", order: "desc" });

    expect(namesOf(oldest)[4]).toBe("Initech");
    expect(namesOf(newest)[0]).toBe("Initech");
  });

  it("pages through the list and reports the total", async () => {
    await sampleCompanies();

    const first = await list({ pageSize: 2 });
    const second = await list({ pageSize: 2, page: 2 });
    const third = await list({ pageSize: 2, page: 3 });
    const beyond = await list({ pageSize: 2, page: 4 });

    expect(namesOf(first)).toEqual(["Acme Holdings", "Globex"]);
    expect(namesOf(second)).toEqual(["Initech", "Umbrella"]);
    expect(namesOf(third)).toEqual(["Zenith"]);
    expect(namesOf(beyond)).toEqual([]);
    expect(metaOf(first)).toEqual({ page: 1, pageSize: 2, total: 5 });
    expect(metaOf(third)).toEqual({ page: 3, pageSize: 2, total: 5 });
    expect(metaOf(beyond)).toEqual({ page: 4, pageSize: 2, total: 5 });
  });

  it("counts only the matches, and only the companies the caller may see, in total", async () => {
    await sampleCompanies();

    const filtered = await list({ industry: "retail", pageSize: 1 });
    const scoped = await list({ pageSize: 1 }, asMeera);

    expect(metaOf(filtered)).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(metaOf(scoped)).toEqual({ page: 1, pageSize: 1, total: 3 });
  });

  it("gives every company exactly one place when the sorted values are equal", async () => {
    for (let index = 0; index < 5; index += 1) {
      await makeCompany(ravi, { name: "Same", industry: "Same" });
    }

    for (const sort of ["name", "industry"]) {
      const pages = await Promise.all([1, 2, 3].map((page) => list({ sort, pageSize: 2, page })));
      const ids = pages.flatMap((page) => companiesOf(page).map((company) => company.id));
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
    ["sort", "lastContactAt"],
    ["order", "up"],
    ["industry", "x".repeat(101)],
    ["ownerId", "me"],
    ["search", "x".repeat(101)],
  ])("answers VALIDATION_FAILED for %s=%s", async (key, value) => {
    const response = await list({ [key]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([key]);
  });
});
