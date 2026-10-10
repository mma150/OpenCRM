import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type { Lead, Prisma, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import * as timeline from "../../lib/timeline";

interface ApiLead {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  company: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  owner: { id: string; name: string };
  estimatedValue: number | null;
  notes: string | null;
  lostReason: string | null;
  lostNote: string | null;
  lostAt: string | null;
  lastContactAt: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  convertedAt: string | null;
  convertedTo: { contact: Link | null; company: Link | null; opportunity: Link | null } | null;
  customFields: Record<string, string | number | null>;
  createdAt: string;
  updatedAt: string;
}

interface Link {
  id: string;
  name: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const LEADS = "/api/v1/leads";

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

function leadOf(response: request.Response): ApiLead {
  return (response.body as Envelope<ApiLead>).data;
}

function leadsOf(response: request.Response): ApiLead[] {
  return (response.body as Envelope<ApiLead[]>).data;
}

function namesOf(response: request.Response): string[] {
  return leadsOf(response).map((lead) => lead.name);
}

let leadCount = 0;

// Straight into the database, so a test can start from any state. Each lead is created a
// minute after the one before, which makes the default order (newest first) predictable.
async function makeLead(
  owner: User,
  fields: Partial<Prisma.LeadUncheckedCreateInput> = {},
): Promise<Lead> {
  leadCount += 1;
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, leadCount));
  return prisma.lead.create({
    data: {
      // Ids in creation order, like the real ones, so ties in a sort are predictable too.
      id: `01920000-0000-7000-8000-${String(leadCount).padStart(12, "0")}`,
      firstName: "Lead",
      lastName: String(leadCount),
      source: "WEBSITE",
      ownerId: owner.id,
      createdById: owner.id,
      createdAt,
      ...fields,
    },
  });
}

function stored(id: string): Promise<Lead> {
  return prisma.lead.findUniqueOrThrow({ where: { id } });
}

// The three ways to change an existing lead that share one rule, in an order that lets all
// three succeed on the same lead (delete last).
function writesTo(agent: Agent, id: string) {
  return [
    ["update", () => agent.patch(`${LEADS}/${id}`).send({ company: "Changed" })],
    ["mark-lost", () => agent.post(`${LEADS}/${id}/mark-lost`).send({ reason: "PRICE" })],
    ["delete", () => agent.delete(`${LEADS}/${id}`)],
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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("who sees which leads", () => {
  // One lead per possible owner.
  async function oneLeadEach() {
    return {
      ofAdmin: await makeLead(admin, { firstName: "Of", lastName: "Admin" }),
      ofMeera: await makeLead(meera, { firstName: "Of", lastName: "Meera" }),
      ofRavi: await makeLead(ravi, { firstName: "Of", lastName: "Ravi" }),
      ofOmar: await makeLead(omar, { firstName: "Of", lastName: "Omar" }),
      ofTara: await makeLead(tara, { firstName: "Of", lastName: "Tara" }),
      ofUma: await makeLead(uma, { firstName: "Of", lastName: "Uma" }),
    };
  }

  const everyLead = ["Of Admin", "Of Meera", "Of Omar", "Of Ravi", "Of Tara", "Of Uma"];

  it.each([
    ["an Admin", () => asAdmin, everyLead],
    ["a Read-only user", () => asViewer, everyLead],
    ["a Sales Manager (own leads and the team's)", () => asMeera, ["Of Meera", "Of Ravi"]],
    ["a Sales Rep (own leads only)", () => asRavi, ["Of Ravi"]],
  ])("lists the right leads for %s", async (_who, agent, expected) => {
    await oneLeadEach();

    const response = await agent().get(LEADS);
    const body = response.body as Envelope<ApiLead[]>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(namesOf(response).sort()).toEqual(expected);
    expect(body.meta).toEqual({ page: 1, pageSize: 25, total: expected.length });
  });

  it("lets an Admin and a Read-only user read any lead", async () => {
    const { ofTara } = await oneLeadEach();

    for (const agent of [asAdmin, asViewer]) {
      const response = await agent.get(`${LEADS}/${ofTara.id}`);
      expect(response.status).toBe(200);
      expect(leadOf(response).owner).toEqual({ id: tara.id, name: "Tara Rep" });
    }
  });

  it("lets a Sales Manager read their own and their team's leads, and nobody else's", async () => {
    const leads = await oneLeadEach();

    expect((await asMeera.get(`${LEADS}/${leads.ofMeera.id}`)).status).toBe(200);
    expect((await asMeera.get(`${LEADS}/${leads.ofRavi.id}`)).status).toBe(200);
    for (const outside of [leads.ofAdmin, leads.ofOmar, leads.ofTara, leads.ofUma]) {
      const response = await asMeera.get(`${LEADS}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("lets a Sales Rep read only their own leads, not even their manager's", async () => {
    const leads = await oneLeadEach();

    expect((await asRavi.get(`${LEADS}/${leads.ofRavi.id}`)).status).toBe(200);
    for (const outside of [leads.ofAdmin, leads.ofMeera, leads.ofTara, leads.ofUma]) {
      const response = await asRavi.get(`${LEADS}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("answers a hidden lead exactly like one that does not exist", async () => {
    const { ofTara } = await oneLeadEach();

    const hidden = await asRavi.get(`${LEADS}/${ofTara.id}`);
    const missing = await asRavi.get(`${LEADS}/${UNKNOWN_ID}`);

    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
  });

  it("follows the team: a rep moved to another manager takes their leads along", async () => {
    const mover = await createUser({ name: "Mo Mover", role: "SALES_REP", managerId: omar.id });
    const lead = await makeLead(mover);
    expect((await asMeera.get(`${LEADS}/${lead.id}`)).status).toBe(404);

    await prisma.user.update({ where: { id: mover.id }, data: { managerId: meera.id } });

    expect((await asMeera.get(`${LEADS}/${lead.id}`)).status).toBe(200);
    await prisma.lead.deleteMany();
    await prisma.user.delete({ where: { id: mover.id } });
  });
});

describe("create", () => {
  const body = { firstName: "Jane", lastName: "Doe", source: "REFERRAL" };

  it("creates a lead owned by the caller, with status NEW", async () => {
    const response = await asRavi.post(LEADS).send({
      ...body,
      company: "Acme",
      jobTitle: "Buyer",
      email: "  Jane@Example.com ",
      phone: "+91 98765 43210",
      estimatedValue: 1234.56,
      notes: "Met at the fair",
    });
    const lead = leadOf(response);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(lead).toEqual({
      id: lead.id,
      firstName: "Jane",
      lastName: "Doe",
      name: "Jane Doe",
      company: "Acme",
      jobTitle: "Buyer",
      email: "jane@example.com",
      phone: "+91 98765 43210",
      source: "REFERRAL",
      status: "NEW",
      owner: { id: ravi.id, name: "Ravi Rep" },
      estimatedValue: 1234.56,
      notes: "Met at the fair",
      lostReason: null,
      lostNote: null,
      lostAt: null,
      lastContactAt: null,
      followUpAt: null,
      followUpNote: null,
      convertedAt: null,
      convertedTo: null,
      customFields: {},
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    });
    expect((await stored(lead.id)).createdById).toBe(ravi.id);
  });

  it("stores an empty or missing optional field as null", async () => {
    const response = await asRavi.post(LEADS).send({ ...body, company: "  ", email: "" });

    expect(response.status).toBe(201);
    expect(leadOf(response)).toMatchObject({
      company: null,
      jobTitle: null,
      email: null,
      phone: null,
      estimatedValue: null,
      notes: null,
    });
  });

  it("lets a Sales Rep create only for themselves", async () => {
    const own = await asRavi.post(LEADS).send({ ...body, ownerId: ravi.id });
    expect(own.status).toBe(201);

    for (const other of [meera, tara, admin]) {
      const response = await asRavi.post(LEADS).send({ ...body, ownerId: other.id });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect(await prisma.lead.count()).toBe(1);
  });

  it("lets a Sales Manager create for themselves and their team, not for another team", async () => {
    for (const owner of [meera, ravi]) {
      const response = await asMeera.post(LEADS).send({ ...body, ownerId: owner.id });
      expect(response.status).toBe(201);
      expect(leadOf(response).owner.id).toBe(owner.id);
    }

    for (const other of [tara, omar, admin, uma]) {
      const response = await asMeera.post(LEADS).send({ ...body, ownerId: other.id });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
  });

  it("lets an Admin create for any user who can own a lead", async () => {
    for (const owner of [admin, omar, tara, uma]) {
      const response = await asAdmin.post(LEADS).send({ ...body, ownerId: owner.id });
      expect(response.status).toBe(201);
      expect(leadOf(response).owner.id).toBe(owner.id);
    }
  });

  it("refuses an owner who is Read-only, deactivated or unknown", async () => {
    for (const ownerId of [viewer.id, deactivated.id, UNKNOWN_ID]) {
      const response = await asAdmin.post(LEADS).send({ ...body, ownerId });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect(await prisma.lead.count()).toBe(0);
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const response = await asViewer.post(LEADS).send(body);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.lead.count()).toBe(0);
  });

  it.each([
    ["a missing first name", { lastName: "Doe", source: "OTHER" }, "firstName"],
    ["an empty last name", { ...body, lastName: " " }, "lastName"],
    ["an unknown source", { ...body, source: "BILLBOARD" }, "source"],
    ["a missing source", { firstName: "Jane", lastName: "Doe" }, "source"],
    ["a bad email", { ...body, email: "not-an-email" }, "email"],
    ["a negative value", { ...body, estimatedValue: -1 }, "estimatedValue"],
    ["a value with three decimals", { ...body, estimatedValue: 1.234 }, "estimatedValue"],
    ["a value too large to store", { ...body, estimatedValue: 10_000_000_000 }, "estimatedValue"],
    ["a value sent as text", { ...body, estimatedValue: "100" }, "estimatedValue"],
    ["a malformed owner id", { ...body, ownerId: "me" }, "ownerId"],
    ["a status (a new lead is always NEW)", { ...body, status: "QUALIFIED" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const response = await asAdmin.post(LEADS).send(badBody);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.lead.count()).toBe(0);
  });
});

describe("update", () => {
  it("changes only the fields that were sent", async () => {
    const lead = await makeLead(ravi, { company: "Acme", phone: "123", notes: "Keep me" });

    const response = await asRavi
      .patch(`${LEADS}/${lead.id}`)
      .send({ firstName: "Janet", company: "Globex", status: "CONTACTED", estimatedValue: 500 });

    expect(response.status).toBe(200);
    expect(leadOf(response)).toMatchObject({
      firstName: "Janet",
      lastName: lead.lastName,
      name: `Janet ${lead.lastName}`,
      company: "Globex",
      phone: "123",
      notes: "Keep me",
      status: "CONTACTED",
      estimatedValue: 500,
      owner: { id: ravi.id, name: "Ravi Rep" },
    });
  });

  it("clears a field that is sent as null or as an empty string", async () => {
    const lead = await makeLead(ravi, {
      company: "Acme",
      jobTitle: "Buyer",
      email: "jane@example.com",
      phone: "123",
      estimatedValue: 99.5,
      notes: "Old",
    });

    const response = await asRavi.patch(`${LEADS}/${lead.id}`).send({
      company: null,
      jobTitle: "",
      email: null,
      phone: null,
      estimatedValue: null,
      notes: null,
    });

    expect(response.status).toBe(200);
    expect(leadOf(response)).toMatchObject({
      company: null,
      jobTitle: null,
      email: null,
      phone: null,
      estimatedValue: null,
      notes: null,
    });
  });

  it.each([
    ["LOST (use mark-lost)", { status: "LOST" }, "status"],
    ["CONVERTED", { status: "CONVERTED" }, "status"],
    ["a null first name", { firstName: null }, "firstName"],
    ["a null source", { source: null }, "source"],
    ["a new owner (use assign)", { ownerId: UNKNOWN_ID }, ""],
    ["lost fields", { lostReason: "PRICE" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const lead = await makeLead(ravi);

    const response = await asRavi.patch(`${LEADS}/${lead.id}`).send(badBody);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect((await stored(lead.id)).status).toBe("NEW");
  });

  it("answers LEAD_CONVERTED for every change to a converted lead, and leaves it as it was", async () => {
    const lead = await makeLead(ravi, { status: "CONVERTED", company: "Before" });

    const refused = [
      await asRavi.patch(`${LEADS}/${lead.id}`).send({ status: "NEW" }),
      await asRavi.patch(`${LEADS}/${lead.id}`).send({ company: "After" }),
      await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "PRICE" }),
      await asAdmin.delete(`${LEADS}/${lead.id}`),
    ];

    for (const response of refused) {
      expect(response.status).toBe(409);
      expect(errorOf(response).code).toBe("LEAD_CONVERTED");
      expect(errorOf(response).details).toBeNull();
    }
    expect(await stored(lead.id)).toMatchObject({
      status: "CONVERTED",
      company: "Before",
      lostReason: null,
      deletedAt: null,
    });
  });

  it("still lets a converted lead be read and given to another owner", async () => {
    const lead = await makeLead(ravi, { status: "CONVERTED" });

    const read = await asRavi.get(`${LEADS}/${lead.id}`);
    const assigned = await asMeera.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: meera.id });

    expect(read.status).toBe(200);
    expect(assigned.status).toBe(200);
    expect(leadOf(assigned)).toMatchObject({ status: "CONVERTED", owner: { id: meera.id } });
  });
});

describe("mark lost and reopen", () => {
  it("marks a lead lost with the reason, the note and the time", async () => {
    const lead = await makeLead(ravi, { status: "QUALIFIED" });
    const before = Date.now();

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/mark-lost`)
      .send({ reason: "CHOSE_COMPETITOR", note: " Went with Globex " });
    const body = leadOf(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "LOST",
      lostReason: "CHOSE_COMPETITOR",
      lostNote: "Went with Globex",
    });
    expect(Date.parse(body.lostAt ?? "")).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(body.lostAt ?? "")).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("accepts a reason without a note", async () => {
    const lead = await makeLead(ravi);

    const response = await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "OTHER" });

    expect(response.status).toBe(200);
    expect(leadOf(response)).toMatchObject({ status: "LOST", lostReason: "OTHER", lostNote: null });
  });

  it.each([
    ["a missing reason", { note: "No reason" }, "reason"],
    ["an unknown reason", { reason: "BORED" }, "reason"],
  ])("answers VALIDATION_FAILED for %s", async (_what, badBody, path) => {
    const lead = await makeLead(ravi);

    const response = await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send(badBody);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
    expect((await stored(lead.id)).status).toBe("NEW");
  });

  it.each(["NEW", "CONTACTED", "QUALIFIED"])(
    "reopens a lost lead when its status is set to %s",
    async (status) => {
      const lead = await makeLead(ravi);
      await asRavi
        .post(`${LEADS}/${lead.id}/mark-lost`)
        .send({ reason: "PRICE", note: "Too dear" });

      const response = await asRavi.patch(`${LEADS}/${lead.id}`).send({ status });

      expect(response.status).toBe(200);
      expect(leadOf(response)).toMatchObject({
        status,
        lostReason: null,
        lostNote: null,
        lostAt: null,
      });
    },
  );

  it("keeps a lead lost when it is edited without a status", async () => {
    const lead = await makeLead(ravi);
    await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "NO_BUDGET" });

    const response = await asRavi.patch(`${LEADS}/${lead.id}`).send({ notes: "Try next year" });

    expect(response.status).toBe(200);
    expect(leadOf(response)).toMatchObject({
      status: "LOST",
      lostReason: "NO_BUDGET",
      notes: "Try next year",
    });
    expect(leadOf(response).lostAt).not.toBeNull();
  });
});

describe("who may change a lead (update, mark lost, delete)", () => {
  it("lets an Admin change anyone's lead", async () => {
    const lead = await makeLead(tara);

    for (const [action, write] of writesTo(asAdmin, lead.id)) {
      expect((await write()).status, action).toBe(200);
    }
    expect((await stored(lead.id)).deletedAt).not.toBeNull();
  });

  it("lets a Sales Manager change their own and their team's leads", async () => {
    for (const owner of [meera, ravi]) {
      const lead = await makeLead(owner);
      for (const [action, write] of writesTo(asMeera, lead.id)) {
        expect((await write()).status, `${action} ${owner.name}`).toBe(200);
      }
      expect((await stored(lead.id)).deletedAt).not.toBeNull();
    }
  });

  it("answers NOT_FOUND when a Sales Manager changes a lead outside their team", async () => {
    for (const owner of [tara, omar, admin, uma]) {
      const lead = await makeLead(owner);
      for (const [action, write] of writesTo(asMeera, lead.id)) {
        const response = await write();
        expect(response.status, `${action} ${owner.name}`).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
      }
      expect(await stored(lead.id)).toMatchObject({
        company: null,
        status: "NEW",
        deletedAt: null,
      });
    }
  });

  it("lets a Sales Rep change their own leads", async () => {
    const lead = await makeLead(ravi);

    for (const [action, write] of writesTo(asRavi, lead.id)) {
      expect((await write()).status, action).toBe(200);
    }
    expect((await stored(lead.id)).deletedAt).not.toBeNull();
  });

  it("answers NOT_FOUND when a Sales Rep changes someone else's lead", async () => {
    for (const owner of [meera, tara, admin]) {
      const lead = await makeLead(owner);
      for (const [action, write] of writesTo(asRavi, lead.id)) {
        const response = await write();
        expect(response.status, `${action} ${owner.name}`).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
      }
      expect(await stored(lead.id)).toMatchObject({
        company: null,
        status: "NEW",
        deletedAt: null,
      });
    }
  });

  it("answers FORBIDDEN for every change by a Read-only user", async () => {
    const lead = await makeLead(ravi);

    for (const [action, write] of writesTo(asViewer, lead.id)) {
      const response = await write();
      expect(response.status, action).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await stored(lead.id)).toMatchObject({ company: null, status: "NEW", deletedAt: null });
  });

  it("answers NOT_FOUND for a lead that does not exist", async () => {
    for (const [action, write] of writesTo(asAdmin, UNKNOWN_ID)) {
      const response = await write();
      expect(response.status, action).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });
});

describe("assign", () => {
  function assign(agent: Agent, lead: Lead, owner: { id: string }) {
    return agent.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: owner.id });
  }

  it("lets an Admin give any lead to any user who can own one", async () => {
    const lead = await makeLead(ravi);

    for (const owner of [tara, omar, admin]) {
      const response = await assign(asAdmin, lead, owner);
      expect(response.status).toBe(200);
      expect(leadOf(response).owner).toEqual({ id: owner.id, name: owner.name });
    }
    expect((await stored(lead.id)).ownerId).toBe(admin.id);
  });

  it("lets a Sales Manager move a lead between themselves and their team", async () => {
    const lead = await makeLead(ravi);

    const toSelf = await assign(asMeera, lead, meera);
    const toRep = await assign(asMeera, lead, ravi);

    expect(toSelf.status).toBe(200);
    expect(leadOf(toSelf).owner.id).toBe(meera.id);
    expect(toRep.status).toBe(200);
    expect(leadOf(toRep).owner.id).toBe(ravi.id);
  });

  it("does not let a Sales Manager give a lead to someone outside their team", async () => {
    const lead = await makeLead(ravi);

    for (const owner of [tara, omar, admin, uma]) {
      const response = await assign(asMeera, lead, owner);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect((await stored(lead.id)).ownerId).toBe(ravi.id);
  });

  it("answers NOT_FOUND when a Sales Manager assigns a lead outside their team", async () => {
    const lead = await makeLead(tara);

    const response = await assign(asMeera, lead, ravi);

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
    expect((await stored(lead.id)).ownerId).toBe(tara.id);
  });

  it("answers FORBIDDEN for a Sales Rep, even on their own lead", async () => {
    const lead = await makeLead(ravi);

    const response = await assign(asRavi, lead, ravi);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const lead = await makeLead(ravi);

    const response = await assign(asViewer, lead, tara);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect((await stored(lead.id)).ownerId).toBe(ravi.id);
  });

  it("refuses a new owner who is Read-only, deactivated or unknown", async () => {
    const lead = await makeLead(ravi);

    for (const owner of [viewer, deactivated, { id: UNKNOWN_ID }]) {
      const response = await assign(asAdmin, lead, owner);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
    expect((await stored(lead.id)).ownerId).toBe(ravi.id);
  });

  it("answers NOT_FOUND for a lead that does not exist", async () => {
    const response = await asAdmin.post(`${LEADS}/${UNKNOWN_ID}/assign`).send({ ownerId: ravi.id });

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
  });
});

describe("delete", () => {
  it("answers 200 with data null and keeps the row, marked as deleted", async () => {
    const lead = await makeLead(ravi);

    const response = await asRavi.delete(`${LEADS}/${lead.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect((await stored(lead.id)).deletedAt).toBeInstanceOf(Date);
  });

  it("never shows a deleted lead again, to anyone", async () => {
    const lead = await makeLead(ravi);
    const kept = await makeLead(ravi);
    await asRavi.delete(`${LEADS}/${lead.id}`);

    for (const agent of [asRavi, asMeera, asAdmin, asViewer]) {
      const list = await agent.get(LEADS);
      expect(leadsOf(list).map((item) => item.id)).toEqual([kept.id]);
      expect((list.body as Envelope<ApiLead[]>).meta.total).toBe(1);
      expect((await agent.get(`${LEADS}/${lead.id}`)).status).toBe(404);
    }
  });

  it("answers NOT_FOUND for every change to a deleted lead", async () => {
    const lead = await makeLead(ravi);
    await asAdmin.delete(`${LEADS}/${lead.id}`);

    for (const [action, write] of writesTo(asAdmin, lead.id)) {
      expect((await write()).status, action).toBe(404);
    }
    const assign = await asAdmin.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: tara.id });
    expect(assign.status).toBe(404);
    expect((await stored(lead.id)).ownerId).toBe(ravi.id);
  });
});

describe("list: search, filters, sorting and paging", () => {
  const NEWEST_FIRST = ["Zed Abel", "Maria Janesson", "Jane Doe", "Carlos Diaz", "Ann Zimmer"];

  // Created oldest first: Ann, Carlos, Jane, Maria, Zed.
  async function sampleLeads() {
    await makeLead(ravi, {
      firstName: "Ann",
      lastName: "Zimmer",
      company: "Initech",
      email: "ann@initech.test",
      source: "WEBSITE",
      status: "NEW",
    });
    await makeLead(ravi, {
      firstName: "Carlos",
      lastName: "Diaz",
      company: "Acme Holdings",
      email: "carlos@holdings.test",
      source: "REFERRAL",
      status: "CONTACTED",
    });
    await makeLead(meera, {
      firstName: "Jane",
      lastName: "Doe",
      company: "Globex",
      email: "jd@globex.test",
      source: "EVENT",
      status: "QUALIFIED",
    });
    await makeLead(tara, {
      firstName: "Maria",
      lastName: "Janesson",
      company: null,
      email: "maria@ACME.test",
      source: "COLD_CALL",
      status: "LOST",
      lostReason: "PRICE",
      lostAt: new Date(),
    });
    await makeLead(tara, {
      firstName: "Zed",
      lastName: "Abel",
      company: "Umbrella",
      email: null,
      source: "OTHER",
      status: "NEW",
    });
  }

  function list(query: Record<string, string | number>, agent: Agent = asAdmin) {
    return agent.get(LEADS).query(query);
  }

  it("orders by newest first when nothing is asked for", async () => {
    await sampleLeads();

    const response = await asAdmin.get(LEADS);

    expect(namesOf(response)).toEqual(NEWEST_FIRST);
  });

  it.each([
    ["a first name", "carlos", ["Carlos Diaz"]],
    ["a last name", "ZIMMER", ["Ann Zimmer"]],
    ["part of a name", "jane", ["Maria Janesson", "Jane Doe"]],
    ["a full name", "jane doe", ["Jane Doe"]],
    ["a company", "glob", ["Jane Doe"]],
    ["an email", "holdings.test", ["Carlos Diaz"]],
    ["company or email, whatever the case", "aCmE", ["Maria Janesson", "Carlos Diaz"]],
    ["words from different fields", "ann initech", ["Ann Zimmer"]],
    ["something nobody has", "nomatch", []],
    ["only spaces (no search)", "   ", [...NEWEST_FIRST]],
  ])("searches by %s", async (_what, search, expected) => {
    await sampleLeads();

    const response = await list({ search });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(expected);
    expect((response.body as Envelope<ApiLead[]>).meta.total).toBe(expected.length);
  });

  it("treats % and _ in a search as plain characters", async () => {
    await sampleLeads();

    await makeLead(ravi, { firstName: "Percy", lastName: "Sign", company: "100% Juice_Co" });

    expect(namesOf(await list({ search: "%" }))).toEqual(["Percy Sign"]);
    expect(namesOf(await list({ search: "_" }))).toEqual(["Percy Sign"]);
    expect(namesOf(await list({ search: "\\" }))).toEqual([]);
  });

  it("filters by status", async () => {
    await sampleLeads();

    expect(namesOf(await list({ status: "NEW" }))).toEqual(["Zed Abel", "Ann Zimmer"]);
    expect(namesOf(await list({ status: "LOST" }))).toEqual(["Maria Janesson"]);
    expect(namesOf(await list({ status: "CONVERTED" }))).toEqual([]);
  });

  it("filters by source", async () => {
    await sampleLeads();

    expect(namesOf(await list({ source: "REFERRAL" }))).toEqual(["Carlos Diaz"]);
    expect(namesOf(await list({ source: "EVENT" }))).toEqual(["Jane Doe"]);
  });

  it("filters by owner", async () => {
    await sampleLeads();

    expect(namesOf(await list({ ownerId: tara.id }))).toEqual(["Zed Abel", "Maria Janesson"]);
    expect(namesOf(await list({ ownerId: uma.id }))).toEqual([]);
  });

  it("combines search and filters", async () => {
    await sampleLeads();

    const response = await list({ search: "acme", status: "CONTACTED", ownerId: ravi.id });

    expect(namesOf(response)).toEqual(["Carlos Diaz"]);
  });

  it("never lets a filter widen what the caller may see", async () => {
    await sampleLeads();

    const asRep = await list({ ownerId: tara.id }, asRavi);
    const asManager = await list({ ownerId: tara.id }, asMeera);
    const searched = await list({ search: "umbrella" }, asRavi);

    for (const response of [asRep, asManager, searched]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    }
  });

  it.each([
    ["name", "asc", ["Ann Zimmer", "Carlos Diaz", "Jane Doe", "Maria Janesson", "Zed Abel"]],
    ["name", "desc", ["Zed Abel", "Maria Janesson", "Jane Doe", "Carlos Diaz", "Ann Zimmer"]],
    // A lead without a company comes last either way.
    ["company", "asc", ["Carlos Diaz", "Jane Doe", "Ann Zimmer", "Zed Abel", "Maria Janesson"]],
    ["company", "desc", ["Zed Abel", "Ann Zimmer", "Jane Doe", "Carlos Diaz", "Maria Janesson"]],
    // In pipeline order: NEW, CONTACTED, QUALIFIED, CONVERTED, LOST.
    ["status", "asc", ["Ann Zimmer", "Zed Abel", "Carlos Diaz", "Jane Doe", "Maria Janesson"]],
    ["status", "desc", ["Maria Janesson", "Jane Doe", "Carlos Diaz", "Zed Abel", "Ann Zimmer"]],
    ["createdAt", "asc", ["Ann Zimmer", "Carlos Diaz", "Jane Doe", "Maria Janesson", "Zed Abel"]],
  ])("sorts by %s %s", async (sort, order, expected) => {
    await sampleLeads();

    const response = await list({ sort, order });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(expected);
  });

  it("sorts by updatedAt, so the lead changed last comes first", async () => {
    await sampleLeads();
    const jane = await prisma.lead.findFirstOrThrow({ where: { firstName: "Jane" } });
    await asAdmin.patch(`${LEADS}/${jane.id}`).send({ notes: "Called today" });

    const newest = await list({ sort: "updatedAt" });
    const oldest = await list({ sort: "updatedAt", order: "asc" });

    expect(namesOf(newest)[0]).toBe("Jane Doe");
    expect(namesOf(oldest)[4]).toBe("Jane Doe");
  });

  it("sorts by lastContactAt, with leads never contacted last in both directions", async () => {
    await sampleLeads();
    const day = (date: number) => new Date(Date.UTC(2026, 2, date));
    await prisma.lead.updateMany({
      where: { firstName: "Carlos" },
      data: { lastContactAt: day(1) },
    });
    await prisma.lead.updateMany({ where: { firstName: "Zed" }, data: { lastContactAt: day(2) } });
    await prisma.lead.updateMany({ where: { firstName: "Ann" }, data: { lastContactAt: day(3) } });

    const newest = await list({ sort: "lastContactAt" });
    const oldest = await list({ sort: "lastContactAt", order: "asc" });

    // Maria and Jane were never contacted; between themselves they follow the id.
    expect(namesOf(newest)).toEqual([
      "Ann Zimmer",
      "Zed Abel",
      "Carlos Diaz",
      "Maria Janesson",
      "Jane Doe",
    ]);
    expect(namesOf(oldest)).toEqual([
      "Carlos Diaz",
      "Zed Abel",
      "Ann Zimmer",
      "Jane Doe",
      "Maria Janesson",
    ]);
    expect(leadsOf(newest)[0]?.lastContactAt).toBe("2026-03-03T00:00:00.000Z");
    expect(leadsOf(newest)[4]?.lastContactAt).toBeNull();
  });

  it("pages through the list and reports the total", async () => {
    await sampleLeads();

    const first = await list({ pageSize: 2 });
    const second = await list({ pageSize: 2, page: 2 });
    const third = await list({ pageSize: 2, page: 3 });
    const beyond = await list({ pageSize: 2, page: 4 });

    expect(namesOf(first)).toEqual(["Zed Abel", "Maria Janesson"]);
    expect(namesOf(second)).toEqual(["Jane Doe", "Carlos Diaz"]);
    expect(namesOf(third)).toEqual(["Ann Zimmer"]);
    expect(namesOf(beyond)).toEqual([]);
    expect((first.body as Envelope<ApiLead[]>).meta).toEqual({ page: 1, pageSize: 2, total: 5 });
    expect((third.body as Envelope<ApiLead[]>).meta).toEqual({ page: 3, pageSize: 2, total: 5 });
    expect((beyond.body as Envelope<ApiLead[]>).meta).toEqual({ page: 4, pageSize: 2, total: 5 });
  });

  it("counts only the matches, and only the leads the caller may see, in total", async () => {
    await sampleLeads();

    const filtered = await list({ status: "NEW", pageSize: 1 });
    const scoped = await list({ pageSize: 1 }, asMeera);

    expect((filtered.body as Envelope<ApiLead[]>).meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect((scoped.body as Envelope<ApiLead[]>).meta).toEqual({ page: 1, pageSize: 1, total: 3 });
  });

  it("gives every lead exactly one place when the sorted values are equal", async () => {
    for (let index = 0; index < 5; index += 1) {
      await makeLead(ravi, { firstName: "Same", lastName: "Name", company: "Same" });
    }

    const pages = await Promise.all(
      [1, 2, 3].map((page) => list({ sort: "name", pageSize: 2, page })),
    );
    const ids = pages.flatMap((page) => leadsOf(page).map((lead) => lead.id));

    expect(new Set(ids).size).toBe(5);
  });

  it("accepts the largest page size", async () => {
    const response = await list({ pageSize: 100 });

    expect(response.status).toBe(200);
    expect((response.body as Envelope<ApiLead[]>).meta).toEqual({
      page: 1,
      pageSize: 100,
      total: 0,
    });
  });

  it.each([
    ["page", "0"],
    ["page", "1.5"],
    ["page", "two"],
    ["pageSize", "0"],
    ["pageSize", "101"],
    ["sort", "owner"],
    ["order", "up"],
    ["status", "OPEN"],
    ["source", "BILLBOARD"],
    ["ownerId", "me"],
    ["search", "x".repeat(101)],
  ])("answers VALIDATION_FAILED for %s=%s", async (key, value) => {
    const response = await list({ [key]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([key]);
  });
});

// LEAD-04. The lead keeps its own timeline; what it became is linked both ways.
describe("POST /leads/:id/convert", () => {
  const CONTACTS = "/api/v1/contacts";
  const OPPORTUNITIES = "/api/v1/opportunities";

  // The smallest conversion: a new contact, no company, no opportunity.
  const contactOnly = {
    company: { mode: "none" },
    contact: { mode: "create" },
    opportunity: { create: false },
  };

  function convert(agent: Agent, id: string, body: object = contactOnly) {
    return agent.post(`${LEADS}/${id}/convert`).send(body);
  }

  function stageNamed(name: string) {
    return prisma.pipelineStage.findFirstOrThrow({ where: { name } });
  }

  function makeCompany(owner: User, name: string) {
    return prisma.company.create({ data: { name, ownerId: owner.id, createdById: owner.id } });
  }

  function makeContact(owner: User) {
    return prisma.contact.create({
      data: { firstName: "Known", lastName: "Person", ownerId: owner.id, createdById: owner.id },
    });
  }

  async function recordCounts() {
    return {
      contacts: await prisma.contact.count(),
      companies: await prisma.company.count(),
      opportunities: await prisma.opportunity.count(),
      entries: await prisma.timelineEntry.count(),
    };
  }

  const NOTHING = { contacts: 0, companies: 0, opportunities: 0, entries: 0 };

  it("turns a lead into a contact, a company and an opportunity that belong to the lead's owner", async () => {
    const lastContactAt = new Date("2026-03-01T10:00:00.000Z");
    const lead = await makeLead(ravi, {
      firstName: "Marcus",
      lastName: "Chen",
      company: "Northwind",
      jobTitle: "Director",
      email: "marcus@example.com",
      phone: "+1 555 0100",
      notes: "Met at the fair",
      estimatedValue: 48_000,
      status: "QUALIFIED",
      lastContactAt,
    });
    const before = Date.now();

    const response = await convert(asAdmin, lead.id, {
      company: { mode: "create", name: "  Northwind Logistics " },
      contact: { mode: "create" },
      opportunity: { create: true },
    });
    const converted = leadOf(response);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    const contact = await prisma.contact.findFirstOrThrow();
    const company = await prisma.company.findFirstOrThrow();
    const opportunity = await prisma.opportunity.findFirstOrThrow();
    expect(converted).toMatchObject({
      id: lead.id,
      status: "CONVERTED",
      owner: { id: ravi.id, name: "Ravi Rep" },
      convertedTo: {
        contact: { id: contact.id, name: "Marcus Chen" },
        company: { id: company.id, name: "Northwind Logistics" },
        opportunity: { id: opportunity.id, name: "Northwind Logistics" },
      },
    });
    expect(new Date(converted.convertedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);

    expect(contact).toMatchObject({
      firstName: "Marcus",
      lastName: "Chen",
      jobTitle: "Director",
      email: "marcus@example.com",
      phone: "+1 555 0100",
      notes: "Met at the fair",
      lastContactAt,
      companyId: company.id,
      ownerId: ravi.id,
      createdById: admin.id,
    });
    expect(company).toMatchObject({ ownerId: ravi.id, createdById: admin.id });
    expect(opportunity).toMatchObject({
      stageId: (await stageNamed("New")).id,
      contactId: contact.id,
      companyId: company.id,
      expectedCloseDate: null,
      ownerId: ravi.id,
      createdById: admin.id,
    });
    expect(opportunity.value.toNumber()).toBe(48_000);
  });

  it("writes the conversion on the lead's timeline and names the lead on each new record", async () => {
    const lead = await makeLead(ravi, { firstName: "Marcus", lastName: "Chen" });
    await asRavi.post(`${LEADS}/${lead.id}/notes`).send({ body: "Before the conversion" });

    await convert(asMeera, lead.id, {
      company: { mode: "create", name: "Northwind" },
      contact: { mode: "create" },
      opportunity: { create: true, name: "Fleet deal" },
    });

    const contact = await prisma.contact.findFirstOrThrow();
    const company = await prisma.company.findFirstOrThrow();
    const opportunity = await prisma.opportunity.findFirstOrThrow();
    const fromLead = { id: lead.id, name: "Marcus Chen" };
    const entries = await prisma.timelineEntry.findMany({ where: { kind: { not: "NOTE" } } });
    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(entry.authorId).toBe(meera.id);
    }
    expect(entries.find((entry) => entry.leadId === lead.id)).toMatchObject({
      kind: "STATUS_CHANGE",
      details: {
        from: "NEW",
        to: "CONVERTED",
        contact: { id: contact.id, name: "Marcus Chen" },
        company: { id: company.id, name: "Northwind" },
        opportunity: { id: opportunity.id, name: "Fleet deal" },
      },
    });
    for (const where of [
      { contactId: contact.id },
      { companyId: company.id },
      { opportunityId: opportunity.id },
    ]) {
      expect(await prisma.timelineEntry.findMany({ where })).toMatchObject([
        { kind: "CREATED", details: { fromLead } },
      ]);
    }

    // The lead's own history stays on the lead, and stays readable.
    const history = await asRavi.get(`${LEADS}/${lead.id}/timeline`);
    expect(history.status).toBe(200);
    expect(
      (history.body as Envelope<{ kind: string; body: string | null }[]>).data.map(
        (entry) => entry.body ?? entry.kind,
      ),
    ).toEqual(["STATUS_CHANGE", "Before the conversion"]);
  });

  it("links the contact and the opportunity back to the lead", async () => {
    const lead = await makeLead(ravi, { firstName: "Marcus", lastName: "Chen" });

    const response = await convert(asRavi, lead.id, {
      company: { mode: "none" },
      contact: { mode: "create" },
      opportunity: { create: true },
    });
    const { convertedTo } = leadOf(response);

    const contact = await asRavi.get(`${CONTACTS}/${convertedTo?.contact?.id ?? ""}`);
    const opportunity = await asRavi.get(`${OPPORTUNITIES}/${convertedTo?.opportunity?.id ?? ""}`);
    const fromLead = { id: lead.id, name: "Marcus Chen" };
    expect((contact.body as Envelope<{ convertedFromLead: Link }>).data.convertedFromLead).toEqual(
      fromLead,
    );
    expect(
      (opportunity.body as Envelope<{ convertedFromLead: Link; name: string }>).data,
    ).toMatchObject({ convertedFromLead: fromLead, name: "Marcus Chen", value: 0 });
    // The lead reads the same afterwards as in the answer to the conversion.
    expect(leadOf(await asRavi.get(`${LEADS}/${lead.id}`))).toEqual(leadOf(response));
  });

  it("converts into a contact alone, ignoring opportunity details when create is false", async () => {
    const lead = await makeLead(ravi, { company: "Northwind" });

    const response = await convert(asRavi, lead.id, {
      company: { mode: "none" },
      contact: { mode: "create" },
      opportunity: { create: false, name: "Never made", value: 500 },
    });

    expect(response.status).toBe(200);
    expect(leadOf(response).convertedTo).toEqual({
      contact: {
        id: leadOf(response).convertedTo?.contact?.id,
        name: lead.firstName + " " + lead.lastName,
      },
      company: null,
      opportunity: null,
    });
    expect(await recordCounts()).toEqual({
      contacts: 1,
      companies: 0,
      opportunities: 0,
      entries: 2,
    });
    expect(await prisma.contact.findFirstOrThrow()).toMatchObject({ companyId: null });
  });

  it("links an existing company and an existing contact without changing them", async () => {
    const lead = await makeLead(ravi, {
      firstName: "Marcus",
      lastName: "Chen",
      estimatedValue: 100,
    });
    const acme = await makeCompany(ravi, "Acme");
    const known = await makeContact(meera);
    const proposal = await stageNamed("Proposal");

    const response = await convert(asMeera, lead.id, {
      company: { mode: "existing", id: acme.id },
      contact: { mode: "existing", id: known.id },
      opportunity: {
        create: true,
        name: "Acme rollout",
        value: 2500.5,
        expectedCloseDate: "2026-12-01",
        stageId: proposal.id,
      },
    });

    expect(response.status).toBe(200);
    const opportunity = await prisma.opportunity.findFirstOrThrow();
    expect(leadOf(response).convertedTo).toEqual({
      contact: { id: known.id, name: "Known Person" },
      company: { id: acme.id, name: "Acme" },
      opportunity: { id: opportunity.id, name: "Acme rollout" },
    });
    expect(opportunity).toMatchObject({
      stageId: proposal.id,
      contactId: known.id,
      companyId: acme.id,
      expectedCloseDate: new Date("2026-12-01"),
      ownerId: ravi.id,
    });
    expect(opportunity.value.toNumber()).toBe(2500.5);
    // Nothing new was made of the contact or the company, and neither was touched.
    expect(await recordCounts()).toMatchObject({ contacts: 1, companies: 1, entries: 2 });
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: known.id } })).toEqual(known);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: acme.id } })).toEqual(acme);
    const contact = await asMeera.get(`${CONTACTS}/${known.id}`);
    expect((contact.body as Envelope<{ convertedFromLead: Link }>).data.convertedFromLead).toEqual({
      id: lead.id,
      name: "Marcus Chen",
    });
  });

  it.each([
    ["no body parts", {}, ["company", "contact", "opportunity"]],
    ["an unknown company mode", { company: { mode: "merge" } }, ["company.mode"]],
    ["a new company without a name", { company: { mode: "create" } }, ["company.name"]],
    [
      "a new company with a blank name",
      { company: { mode: "create", name: " " } },
      ["company.name"],
    ],
    ["an existing company without an id", { company: { mode: "existing" } }, ["company.id"]],
    ["a name beside mode none", { company: { mode: "none", name: "Acme" } }, ["company"]],
    ["an unknown contact mode", { contact: { mode: "none" } }, ["contact.mode"]],
    ["an existing contact without an id", { contact: { mode: "existing" } }, ["contact.id"]],
    ["no word on the opportunity", { opportunity: {} }, ["opportunity.create"]],
    ["a negative value", { opportunity: { create: true, value: -1 } }, ["opportunity.value"]],
    [
      "an empty opportunity name",
      { opportunity: { create: true, name: "" } },
      ["opportunity.name"],
    ],
    [
      "a bad date",
      { opportunity: { create: true, expectedCloseDate: "soon" } },
      ["opportunity.expectedCloseDate"],
    ],
    ["an owner", { ownerId: UNKNOWN_ID }, [""]],
  ])("answers VALIDATION_FAILED for %s", async (_what, fields, paths) => {
    const lead = await makeLead(ravi);

    const body = Object.keys(fields).length === 0 ? {} : { ...contactOnly, ...fields };
    const response = await convert(asRavi, lead.id, body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(paths);
    expect((await stored(lead.id)).status).toBe("NEW");
    expect(await recordCounts()).toEqual(NOTHING);
  });

  it("refuses a company or a contact the caller may not see, like one that does not exist", async () => {
    const lead = await makeLead(ravi);
    const tarasCompany = await makeCompany(tara, "Tara Traders");
    const tarasContact = await makeContact(tara);

    const hiddenCompany = await convert(asRavi, lead.id, {
      ...contactOnly,
      company: { mode: "existing", id: tarasCompany.id },
    });
    const missingCompany = await convert(asRavi, lead.id, {
      ...contactOnly,
      company: { mode: "existing", id: UNKNOWN_ID },
    });
    const hiddenContact = await convert(asRavi, lead.id, {
      ...contactOnly,
      contact: { mode: "existing", id: tarasContact.id },
    });

    expect(hiddenCompany.status).toBe(400);
    expect(detailPaths(hiddenCompany)).toEqual(["company.id"]);
    expect(hiddenCompany.body).toEqual(missingCompany.body);
    expect(detailPaths(hiddenContact)).toEqual(["contact.id"]);
    expect((await stored(lead.id)).status).toBe("NEW");
    expect(await prisma.timelineEntry.count()).toBe(0);
  });

  it("refuses a stage that is Won, Lost or unknown for the new opportunity", async () => {
    const lead = await makeLead(ravi);

    for (const stageId of [
      (await stageNamed("Won")).id,
      (await stageNamed("Lost")).id,
      UNKNOWN_ID,
    ]) {
      const response = await convert(asRavi, lead.id, {
        ...contactOnly,
        opportunity: { create: true, stageId },
      });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["opportunity.stageId"]);
    }
    expect(await recordCounts()).toEqual(NOTHING);
  });

  it("answers LEAD_CONVERTED the second time, and makes nothing more", async () => {
    const lead = await makeLead(ravi);
    await convert(asRavi, lead.id);
    const after = await recordCounts();

    const response = await convert(asRavi, lead.id, {
      company: { mode: "create", name: "Again" },
      contact: { mode: "create" },
      opportunity: { create: true },
    });

    expect(response.status).toBe(409);
    expect(errorOf(response)).toMatchObject({ code: "LEAD_CONVERTED", details: null });
    expect(await recordCounts()).toEqual(after);
  });

  it("converts a lead once when two requests arrive together", async () => {
    const lead = await makeLead(ravi);

    const responses = await Promise.all([convert(asRavi, lead.id), convert(asMeera, lead.id)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await recordCounts()).toEqual({
      contacts: 1,
      companies: 0,
      opportunities: 0,
      entries: 2,
    });
  });

  it("refuses a lost lead until it is reopened", async () => {
    const lead = await makeLead(ravi, { status: "LOST", lostReason: "PRICE", lostAt: new Date() });

    const refused = await convert(asRavi, lead.id);
    await asRavi.patch(`${LEADS}/${lead.id}`).send({ status: "QUALIFIED" });
    const accepted = await convert(asRavi, lead.id);

    expect(refused.status).toBe(400);
    expect(errorOf(refused)).toMatchObject({ code: "VALIDATION_FAILED", details: null });
    expect(accepted.status).toBe(200);
  });

  it("lets an Admin, the lead's manager and its owner convert it", async () => {
    for (const agent of [asAdmin, asMeera, asRavi]) {
      const lead = await makeLead(ravi);
      expect((await convert(agent, lead.id)).status).toBe(200);
    }
  });

  it("answers NOT_FOUND outside the caller's reach, and for a lead that is missing or deleted", async () => {
    const ofTara = await makeLead(tara);
    const ofMeera = await makeLead(meera);
    const deleted = await makeLead(ravi, { deletedAt: new Date() });

    const refused = [
      await convert(asMeera, ofTara.id),
      await convert(asRavi, ofTara.id),
      await convert(asRavi, ofMeera.id),
      await convert(asAdmin, deleted.id),
      await convert(asAdmin, UNKNOWN_ID),
    ];

    for (const response of refused) {
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
    expect(await recordCounts()).toEqual(NOTHING);
  });

  it("answers FORBIDDEN for a Read-only user, whether or not the lead exists", async () => {
    const lead = await makeLead(ravi);

    for (const id of [lead.id, UNKNOWN_ID]) {
      const response = await convert(asViewer, id);
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect((await stored(lead.id)).status).toBe("NEW");
  });

  it("undoes everything when any part of the conversion fails", async () => {
    const lead = await makeLead(ravi);
    // The company and the contact are written; the opportunity's entry fails.
    const addTimelineEntry = timeline.addTimelineEntry;
    let calls = 0;
    vi.spyOn(timeline, "addTimelineEntry").mockImplementation((tx, entry) => {
      calls += 1;
      return calls === 3 ? Promise.reject(new Error("entry failed")) : addTimelineEntry(tx, entry);
    });

    const response = await convert(asRavi, lead.id, {
      company: { mode: "create", name: "Northwind" },
      contact: { mode: "create" },
      opportunity: { create: true },
    });

    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe("INTERNAL_ERROR");
    expect(calls).toBe(3);
    expect(await stored(lead.id)).toMatchObject({
      status: "NEW",
      convertedAt: null,
      convertedContactId: null,
    });
    expect(await recordCounts()).toEqual(NOTHING);
    // And the lead can still be converted afterwards.
    vi.restoreAllMocks();
    expect((await convert(asRavi, lead.id)).status).toBe(200);
  });

  it("hides what the lead became, and where a contact came from, from someone who may not see it", async () => {
    const lead = await makeLead(ravi);
    const response = await convert(asRavi, lead.id, {
      company: { mode: "create", name: "Northwind" },
      contact: { mode: "create" },
      opportunity: { create: true },
    });
    const { convertedTo } = leadOf(response);
    const contactId = convertedTo?.contact?.id ?? "";
    // The contact and the opportunity move to another team; the company is deleted.
    await asAdmin.post(`${CONTACTS}/${contactId}/assign`).send({ ownerId: tara.id });
    await asAdmin
      .post(`${OPPORTUNITIES}/${convertedTo?.opportunity?.id ?? ""}/assign`)
      .send({ ownerId: tara.id });
    await asAdmin.delete(`/api/v1/companies/${convertedTo?.company?.id ?? ""}`);

    const forRavi = leadOf(await asRavi.get(`${LEADS}/${lead.id}`));
    const forAdmin = leadOf(await asAdmin.get(`${LEADS}/${lead.id}`));
    const asTara = await signInAs(app, tara);
    const tarasContact = await asTara.get(`${CONTACTS}/${contactId}`);

    expect(forRavi).toMatchObject({
      status: "CONVERTED",
      convertedTo: { contact: null, company: null, opportunity: null },
    });
    expect(forAdmin.convertedTo).toMatchObject({
      contact: { id: contactId },
      company: null,
      opportunity: { id: convertedTo?.opportunity?.id },
    });
    expect(tarasContact.status).toBe(200);
    expect(
      (tarasContact.body as Envelope<{ convertedFromLead: Link | null }>).data.convertedFromLead,
    ).toBeNull();
  });
});

describe("follow-up", () => {
  const AT = "2026-11-15T09:30:00.000Z";

  function followUp(agent: Agent, id: string, body: object) {
    return agent.put(`${LEADS}/${id}/follow-up`).send(body);
  }

  it("sets the time and the note, and answers with the lead", async () => {
    const lead = await makeLead(ravi);

    // 15:00 in India is 09:30 UTC.
    const response = await followUp(asRavi, lead.id, {
      at: "2026-11-15T15:00:00+05:30",
      note: "  Send the price list  ",
    });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(leadOf(response)).toMatchObject({
      id: lead.id,
      followUpAt: AT,
      followUpNote: "Send the price list",
    });
    expect(leadOf(await asRavi.get(`${LEADS}/${lead.id}`)).followUpAt).toBe(AT);
  });

  it("replaces the note: a follow-up sent without one has none", async () => {
    const lead = await makeLead(ravi, { followUpAt: new Date(AT), followUpNote: "Old note" });

    const response = await followUp(asRavi, lead.id, { at: AT });

    expect(leadOf(response)).toMatchObject({ followUpAt: AT, followUpNote: null });
  });

  it("clears the time and the note with at: null", async () => {
    const lead = await makeLead(ravi, {
      followUpAt: new Date(AT),
      followUpNote: "Call back",
      followUpNotifiedAt: new Date(),
    });

    const response = await followUp(asRavi, lead.id, { at: null });

    expect(response.status).toBe(200);
    expect(leadOf(response)).toMatchObject({ followUpAt: null, followUpNote: null });
    expect((await stored(lead.id)).followUpNotifiedAt).toBeNull();
  });

  it("arms a reminder that has fired again when the time moves, not when it stays", async () => {
    const firedAt = new Date("2026-11-15T09:31:00Z");
    const lead = await makeLead(ravi, { followUpAt: new Date(AT), followUpNotifiedAt: firedAt });

    await followUp(asRavi, lead.id, { at: AT, note: "Only the note changed" });
    const afterSameTime = await stored(lead.id);
    await followUp(asRavi, lead.id, { at: "2026-11-20T09:30:00Z" });
    const afterMove = await stored(lead.id);

    expect(afterSameTime.followUpNotifiedAt).toEqual(firedAt);
    expect(afterSameTime.followUpNote).toBe("Only the note changed");
    expect(afterMove.followUpNotifiedAt).toBeNull();
  });

  it.each([
    ["no time", {}, "at"],
    ["a day without a time", { at: "2026-11-15" }, "at"],
    ["a time without an offset", { at: "2026-11-15T09:30:00" }, "at"],
    ["a note over 500 characters", { at: AT, note: "x".repeat(501) }, "note"],
  ])("answers VALIDATION_FAILED for %s", async (_name, body, path) => {
    const lead = await makeLead(ravi);

    const response = await followUp(asRavi, lead.id, body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
  });

  it("lets a Sales Manager set it for their team and an Admin for anyone", async () => {
    const lead = await makeLead(ravi);

    expect((await followUp(asMeera, lead.id, { at: AT })).status).toBe(200);
    expect((await followUp(asAdmin, lead.id, { at: AT })).status).toBe(200);
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const lead = await makeLead(ravi);

    const response = await followUp(asViewer, lead.id, { at: AT });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect((await stored(lead.id)).followUpAt).toBeNull();
  });

  it("answers NOT_FOUND for a lead outside the caller's reach, a deleted one and an unknown id", async () => {
    const ofTara = await makeLead(tara);
    const deleted = await makeLead(ravi, { deletedAt: new Date() });

    for (const [agent, id] of [
      [asRavi, ofTara.id],
      [asMeera, ofTara.id],
      [asRavi, deleted.id],
      [asAdmin, UNKNOWN_ID],
    ] as const) {
      const response = await followUp(agent, id, { at: AT });

      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
    expect((await stored(ofTara.id)).followUpAt).toBeNull();
  });

  it("refuses a new follow-up on a converted or a lost lead, but still clears one", async () => {
    const converted = await makeLead(ravi, { status: "CONVERTED", followUpAt: new Date(AT) });
    const lost = await makeLead(ravi, { status: "LOST", followUpAt: new Date(AT) });

    const onConverted = await followUp(asRavi, converted.id, { at: AT });
    const onLost = await followUp(asRavi, lost.id, { at: AT });
    const clearConverted = await followUp(asRavi, converted.id, { at: null });
    const clearLost = await followUp(asRavi, lost.id, { at: null });

    expect(onConverted.status).toBe(409);
    expect(errorOf(onConverted).code).toBe("LEAD_CONVERTED");
    expect(onLost.status).toBe(400);
    expect(errorOf(onLost)).toMatchObject({ code: "VALIDATION_FAILED", details: null });
    expect(leadOf(clearConverted).followUpAt).toBeNull();
    expect(leadOf(clearLost).followUpAt).toBeNull();
  });

  it("sorts the list by followUpAt, with leads without one last in both directions", async () => {
    await makeLead(ravi, { firstName: "No", lastName: "Follow-up" });
    await makeLead(ravi, { firstName: "Later", lastName: "L", followUpAt: new Date(AT) });
    await makeLead(ravi, {
      firstName: "Sooner",
      lastName: "S",
      followUpAt: new Date("2026-11-01T09:00:00Z"),
    });

    const soonest = await asRavi.get(LEADS).query({ sort: "followUpAt", order: "asc" });
    const latest = await asRavi.get(LEADS).query({ sort: "followUpAt", order: "desc" });

    expect(namesOf(soonest)).toEqual(["Sooner S", "Later L", "No Follow-up"]);
    expect(namesOf(latest)).toEqual(["Later L", "Sooner S", "No Follow-up"]);
  });
});
