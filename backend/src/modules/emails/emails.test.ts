import type request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  MAIL_SERVER_TEXT,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
  useFailingMailServer,
  useFakeMailServer,
  type ValidationDetail,
} from "../../../test/helpers";
import { createApp } from "../../app";
import type { Company, Contact, Lead, Opportunity, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface Entry {
  id: string;
  kind: string;
  conversationType: string | null;
  body: string | null;
  details: {
    to: string[];
    cc: string[];
    subject: string;
    status: string;
    templateId: string | null;
    quote: null;
  } | null;
  occurredAt: string;
  author: { id: string; name: string };
  createdAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;
type Send = Awaited<ReturnType<typeof useFakeMailServer>>;

const API = "/api/v1";
const EMAILS = `${API}/emails`;
const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";

const app = createTestApp();

// Meera manages Ravi; Tara is a rep on no team.
let admin: User;
let meera: User;
let ravi: User;
let tara: User;
let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asTara: Agent;
let asViewer: Agent;

// All four belong to Ravi.
let lead: Lead;
let company: Company;
let contact: Contact;
let opportunity: Opportunity;

function entryOf(response: request.Response): Entry {
  return (response.body as Envelope<Entry>).data;
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

const RECORDS = {
  LEAD: () => ({ type: "LEAD", id: lead.id, path: `leads/${lead.id}` }),
  CONTACT: () => ({ type: "CONTACT", id: contact.id, path: `contacts/${contact.id}` }),
  COMPANY: () => ({ type: "COMPANY", id: company.id, path: `companies/${company.id}` }),
  OPPORTUNITY: () => ({
    type: "OPPORTUNITY",
    id: opportunity.id,
    path: `opportunities/${opportunity.id}`,
  }),
} as const;

type RecordType = keyof typeof RECORDS;

function message(type: RecordType = "CONTACT", change: Record<string, unknown> = {}) {
  const { id } = RECORDS[type]();
  return {
    record: { type, id },
    to: ["elena@northwind.example"],
    subject: "Following up",
    body: "Hello Elena,\n\nHere is what we discussed.",
    ...change,
  };
}

async function timelineOf(agent: Agent, type: RecordType, query = ""): Promise<Entry[]> {
  const response = await agent.get(`${API}/${RECORDS[type]().path}/timeline${query}`);
  expect(response.status).toBe(200);
  return (response.body as Envelope<Entry[]>).data;
}

async function emailEntries(type: RecordType): Promise<Entry[]> {
  return timelineOf(asAdmin, type, "?kind=EMAIL");
}

beforeAll(async () => {
  await resetDatabase();
  await resetPipelineStages();
  admin = await createUser({ role: "ADMIN", name: "Asha Admin", email: "asha@example.com" });
  meera = await createUser({ role: "SALES_MANAGER", name: "Meera Manager" });
  ravi = await createUser({
    role: "SALES_REP",
    name: "Ravi Rep",
    email: "ravi@example.com",
    managerId: meera.id,
  });
  tara = await createUser({ role: "SALES_REP", name: "Tara Rep" });
  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asTara = await signInAs(app, tara);
  asViewer = await signInAs(app, await createUser({ role: "READ_ONLY" }));
});

beforeEach(async () => {
  await resetRecords();
  const owned = { ownerId: ravi.id, createdById: ravi.id };
  lead = await prisma.lead.create({
    data: {
      ...owned,
      firstName: "Lars",
      lastName: "Lead",
      company: "Kestrel Robotics",
      email: "lars@kestrel.example",
      source: "WEBSITE",
    },
  });
  company = await prisma.company.create({ data: { ...owned, name: "Northwind Logistics" } });
  contact = await prisma.contact.create({
    data: {
      ...owned,
      firstName: "Elena",
      lastName: "Rostova",
      email: "elena@northwind.example",
      companyId: company.id,
    },
  });
  const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
  opportunity = await prisma.opportunity.create({
    data: {
      ...owned,
      name: "Fleet tracking rollout",
      stageId: stage.id,
      contactId: contact.id,
      companyId: company.id,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("POST /emails", () => {
  let send: Send;

  beforeEach(async () => {
    send = await useFakeMailServer();
  });

  it.each(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"] as const)(
    "sends from a %s and writes the EMAIL entry on its timeline",
    async (type) => {
      const response = await asRavi
        .post(EMAILS)
        .send(message(type, { cc: ["office@northwind.example"] }));

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        data: {
          id: expect.any(String) as string,
          kind: "EMAIL",
          conversationType: null,
          body: "Hello Elena,\n\nHere is what we discussed.",
          details: {
            to: ["elena@northwind.example"],
            cc: ["office@northwind.example"],
            subject: "Following up",
            status: "SENT",
            templateId: null,
            quote: null,
          },
          occurredAt: expect.any(String) as string,
          author: { id: ravi.id, name: "Ravi Rep" },
          createdAt: expect.any(String) as string,
          fromLead: null,
        },
        meta: {},
      });
      // The organisation's address under the sender's own name; answers go to the sender.
      expect(send).toHaveBeenCalledExactlyOnceWith({
        from: { name: "Ravi Rep", address: "test@opencrm.local" },
        replyTo: "ravi@example.com",
        to: ["elena@northwind.example"],
        cc: ["office@northwind.example"],
        subject: "Following up",
        text: "Hello Elena,\n\nHere is what we discussed.",
      });
      const timeline = await timelineOf(asRavi, type);
      expect(timeline[0]).toEqual(entryOf(response));
      expect(timeline.map((entry) => entry.kind)).toEqual(["EMAIL"]);
    },
  );

  it("moves lastContactAt of a lead, a contact and an opportunity, like a conversation", async () => {
    const before = Date.now();
    await asRavi.post(EMAILS).send(message("LEAD"));
    await asRavi.post(EMAILS).send(message("CONTACT"));
    await asRavi.post(EMAILS).send(message("OPPORTUNITY"));
    await asRavi.post(EMAILS).send(message("COMPANY"));

    const moved = [
      await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }),
      await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } }),
      await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } }),
    ];

    for (const record of moved) {
      expect(record.lastContactAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
      // Sending is not an edit.
      expect(record.updatedAt.getTime()).toBeLessThanOrEqual(before);
    }
  });

  it("does not move lastContactAt back", async () => {
    const later = new Date(Date.now() + 86_400_000);
    await prisma.contact.update({ where: { id: contact.id }, data: { lastContactAt: later } });

    await asRavi.post(EMAILS).send(message());

    const after = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(after.lastContactAt).toEqual(later);
  });

  it("fills in the placeholders of the subject and the body on the server", async () => {
    const response = await asRavi.post(EMAILS).send(
      message("OPPORTUNITY", {
        subject: "{{opportunity.name}} for {{company.name}}",
        body: "Hi {{contact.firstName}} {{ contact.lastName }},\n{{contact.nickname}}\n{{quote.number}}{{sender.name}} <{{sender.email}}>",
      }),
    );

    expect(entryOf(response).details?.subject).toBe(
      "Fleet tracking rollout for Northwind Logistics",
    );
    expect(entryOf(response).body).toBe(
      "Hi Elena Rostova,\n{{contact.nickname}}\nRavi Rep <ravi@example.com>",
    );
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      subject: "Fleet tracking rollout for Northwind Logistics",
      text: "Hi Elena Rostova,\n{{contact.nickname}}\nRavi Rep <ravi@example.com>",
    });
  });

  it("uses a lead's own name and the company typed on it", async () => {
    const response = await asRavi.post(EMAILS).send(
      message("LEAD", {
        subject: "Hello {{contact.firstName}}",
        body: "{{contact.lastName}} at {{company.name}}",
      }),
    );

    expect(entryOf(response).details?.subject).toBe("Hello Lars");
    expect(entryOf(response).body).toBe("Lead at Kestrel Robotics");
  });

  it("keeps a filled-in subject on one line", async () => {
    await prisma.company.update({
      where: { id: company.id },
      data: { name: "Northwind\r\nBcc: attacker@evil.example" },
    });

    const response = await asRavi
      .post(EMAILS)
      .send(message("COMPANY", { subject: "About {{company.name}}" }));

    expect(entryOf(response).details?.subject).toBe("About Northwind Bcc: attacker@evil.example");
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      subject: "About Northwind Bcc: attacker@evil.example",
    });
  });

  it("sends to each address once, trimmed and lowercased", async () => {
    const response = await asRavi.post(EMAILS).send(
      message("CONTACT", {
        to: [" Elena@Northwind.example ", "elena@northwind.example", "ops@northwind.example"],
        cc: ["OPS@northwind.example", "office@northwind.example", "office@northwind.example"],
      }),
    );

    expect(entryOf(response).details).toMatchObject({
      to: ["elena@northwind.example", "ops@northwind.example"],
      cc: ["office@northwind.example"],
    });
  });

  it("remembers the template the text came from", async () => {
    const template = await prisma.emailTemplate.create({
      data: { name: "Follow-up", subject: "s", body: "b", ownerId: ravi.id },
    });

    const response = await asRavi
      .post(EMAILS)
      .send(message("CONTACT", { templateId: template.id }));

    expect(response.status).toBe(201);
    expect(entryOf(response).details?.templateId).toBe(template.id);
    // What is sent is the request's own text, not the template's.
    expect(entryOf(response).body).toBe("Hello Elena,\n\nHere is what we discussed.");
  });

  it("refuses a template the caller may not see, on templateId, and sends nothing", async () => {
    const hidden = await prisma.emailTemplate.create({
      data: { name: "Tara's", subject: "s", body: "b", ownerId: tara.id },
    });

    for (const templateId of [hidden.id, UNKNOWN_ID]) {
      const response = await asRavi.post(EMAILS).send(message("CONTACT", { templateId }));

      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["templateId"]);
    }
    expect(send).not.toHaveBeenCalled();
    expect(await emailEntries("CONTACT")).toEqual([]);
  });

  it("appears in the activity feed, counted as an email", async () => {
    await asRavi.post(EMAILS).send(message("CONTACT"));

    const response = await asAdmin.get(`${API}/activity?kind=EMAIL`);
    const body = response.body as Envelope<(Entry & { record: unknown })[]> & {
      meta: { total: number; summary: Record<string, number> };
    };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      kind: "EMAIL",
      author: { id: ravi.id },
      record: { type: "CONTACT", id: contact.id, name: "Elena Rostova" },
    });
    expect(body.meta.summary).toEqual({ conversations: 0, notes: 0, statusChanges: 0, emails: 1 });
    // A manager sees their rep's email in the feed too.
    const forMeera = (await asMeera.get(`${API}/activity`)).body as Envelope<Entry[]>;
    expect(forMeera.data.map((entry) => entry.kind)).toEqual(["EMAIL"]);
  });

  describe("access", () => {
    it.each(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"] as const)(
      "follows the %s: its owner, the owner's manager and an Admin may send",
      async (type) => {
        for (const agent of [asRavi, asMeera, asAdmin]) {
          expect((await agent.post(EMAILS).send(message(type))).status).toBe(201);
        }
        expect(await emailEntries(type)).toHaveLength(3);
      },
    );

    it.each(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"] as const)(
      "answers NOT_FOUND for a %s outside the caller's reach, and sends nothing",
      async (type) => {
        const response = await asTara.post(EMAILS).send(message(type));
        const unknown = await asTara
          .post(EMAILS)
          .send({ ...message(type), record: { type, id: UNKNOWN_ID } });

        expect(response.status).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
        expect(response.body).toEqual(unknown.body);
        expect(send).not.toHaveBeenCalled();
        expect(await emailEntries(type)).toEqual([]);
      },
    );

    it("answers FORBIDDEN for a Read-only user, who sees the record but may not write on it", async () => {
      const response = await asViewer.post(EMAILS).send(message("CONTACT"));

      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
      expect(send).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND for an id of another record type, and for a deleted record", async () => {
      const wrongType = await asRavi
        .post(EMAILS)
        .send({ ...message(), record: { type: "CONTACT", id: lead.id } });
      await prisma.contact.update({ where: { id: contact.id }, data: { deletedAt: new Date() } });
      const deleted = await asRavi.post(EMAILS).send(message("CONTACT"));

      expect([wrongType.status, deleted.status]).toEqual([404, 404]);
      expect(send).not.toHaveBeenCalled();
    });

    it("still sends from a lost lead and a closed opportunity", async () => {
      const won = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "WON" } });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "LOST" } });
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { stageId: won.id, closedAt: new Date() },
      });

      expect((await asRavi.post(EMAILS).send(message("LEAD"))).status).toBe(201);
      expect((await asRavi.post(EMAILS).send(message("OPPORTUNITY"))).status).toBe(201);
    });
  });

  describe("validation", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `person${String(index)}@example.com`);

    it.each([
      ["no record", { record: undefined }, "record"],
      ["an unknown record type", { record: { type: "TASK", id: UNKNOWN_ID } }, "record.type"],
      ["a record id that is not a uuid", { record: { type: "LEAD", id: "7" } }, "record.id"],
      ["no recipient", { to: [] }, "to"],
      ["a missing to", { to: undefined }, "to"],
      ["eleven recipients", { to: eleven }, "to"],
      ["a recipient that is not an email", { to: ["elena"] }, "to.0"],
      ["a recipient with a name", { to: ["Elena <elena@northwind.example>"] }, "to.0"],
      ["eleven addresses in cc", { cc: eleven }, "cc"],
      ["a cc that is not an email", { cc: ["ok@example.com", "nope"] }, "cc.1"],
      ["an empty subject", { subject: "  " }, "subject"],
      ["a subject of 201 characters", { subject: "s".repeat(201) }, "subject"],
      ["a subject with a line break", { subject: "Hi\r\nBcc: x@evil.example" }, "subject"],
      ["an empty body", { body: "" }, "body"],
      ["a body of 20001 characters", { body: "b".repeat(20_001) }, "body"],
      ["a templateId that is not a uuid", { templateId: "follow-up" }, "templateId"],
    ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
      const response = await asRavi.post(EMAILS).send(message("CONTACT", change));

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual([path]);
      expect(send).not.toHaveBeenCalled();
    });

    it.each(["from", "replyTo", "bcc", "attachments", "authorId", "occurredAt"])(
      "does not let a request set %s",
      async (key) => {
        const response = await asRavi
          .post(EMAILS)
          .send(message("CONTACT", { [key]: "x@y.example" }));

        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe("VALIDATION_FAILED");
        expect(send).not.toHaveBeenCalled();
      },
    );
  });
});

describe("POST /emails when sending does not work", () => {
  it("answers EMAIL_NOT_CONFIGURED while email is off, and writes nothing", async () => {
    const response = await asRavi.post(EMAILS).send(message("CONTACT"));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "EMAIL_NOT_CONFIGURED",
        message: "Outgoing email is not set up. Ask an Admin to add a mail server in the settings.",
        details: null,
      },
    });
    expect(await emailEntries("CONTACT")).toEqual([]);
    expect(
      (await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).lastContactAt,
    ).toBeNull();
  });

  it("answers EMAIL_SEND_FAILED when the mail server refuses, and writes no timeline entry", async () => {
    await useFakeMailServer();
    useFailingMailServer("EENVELOPE");

    const response = await asRavi.post(EMAILS).send(message("CONTACT"));

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "EMAIL_SEND_FAILED",
        message: "The mail server refused the sender or a recipient address. (SMTP 554)",
        details: null,
      },
    });
    expect(response.text).not.toContain(MAIL_SERVER_TEXT);
    expect(await emailEntries("CONTACT")).toEqual([]);
    expect(await prisma.timelineEntry.count()).toBe(0);
    expect(
      (await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).lastContactAt,
    ).toBeNull();
  });

  it("checks access before it says anything about the mail server", async () => {
    const outsider = await asTara.post(EMAILS).send(message("CONTACT"));
    const viewer = await asViewer.post(EMAILS).send(message("CONTACT"));

    expect([outsider.status, viewer.status]).toEqual([404, 403]);
  });
});

describe("POST /emails: the sending limit", () => {
  it("stops one user after the limit with RATE_LIMITED, and leaves the others alone", async () => {
    const limited = createApp({ rateLimit: { sendLimit: 3 } });
    const raviLimited = await signInAs(limited, ravi);
    const meeraLimited = await signInAs(limited, meera);
    const send = await useFakeMailServer();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await raviLimited.post(EMAILS).send(message("CONTACT"))).status);
    }
    const refused = await raviLimited.post(EMAILS).send(message("CONTACT"));
    const other = await meeraLimited.post(EMAILS).send(message("CONTACT"));

    expect(statuses).toEqual([201, 201, 201, 429, 429]);
    expect(errorOf(refused).code).toBe("RATE_LIMITED");
    expect(errorOf(refused).details).toEqual({ retryAfterSeconds: expect.any(Number) as number });
    expect(refused.headers["retry-after"]).toBeDefined();
    expect(other.status).toBe(201);
    expect(send).toHaveBeenCalledTimes(4);
    expect(await emailEntries("CONTACT")).toHaveLength(4);
  });

  it("allows 30 emails in 5 minutes by default", async () => {
    const standard = createApp();
    const agent = await signInAs(standard, ravi);

    // Email is off, so nothing is sent; the limiter still counts every attempt.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      statuses.push((await agent.post(EMAILS).send(message("CONTACT"))).status);
    }

    expect(statuses.slice(0, 30)).toEqual(Array.from({ length: 30 }, () => 409));
    expect(statuses[30]).toBe(429);
  });
});

describe("GET /emails/defaults", () => {
  const defaults = async (agent: Agent, type: RecordType, id = RECORDS[type]().id) =>
    agent.get(`${EMAILS}/defaults?recordType=${type}&recordId=${id}`);

  it("suggests a lead's own address", async () => {
    const response = await defaults(asRavi, "LEAD");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { recipients: [{ name: "Lars Lead", email: "lars@kestrel.example", contactId: null }] },
      meta: {},
    });
  });

  it("suggests a contact's address, and an opportunity's contact", async () => {
    const elena = {
      name: "Elena Rostova",
      email: "elena@northwind.example",
      contactId: contact.id,
    };

    expect((await defaults(asRavi, "CONTACT")).body).toEqual({
      data: { recipients: [elena] },
      meta: {},
    });
    expect((await defaults(asRavi, "OPPORTUNITY")).body).toEqual({
      data: { recipients: [elena] },
      meta: {},
    });
  });

  it("suggests the contacts of a company that have an address and that the caller may see", async () => {
    const data = { companyId: company.id, createdById: ravi.id };
    const anna = await prisma.contact.create({
      data: {
        ...data,
        ownerId: ravi.id,
        firstName: "Anna",
        lastName: "Aziz",
        email: "anna@northwind.example",
      },
    });
    await prisma.contact.create({
      data: { ...data, ownerId: ravi.id, firstName: "No", lastName: "Email" },
    });
    await prisma.contact.create({
      data: {
        ...data,
        ownerId: ravi.id,
        firstName: "Gone",
        lastName: "Away",
        email: "gone@northwind.example",
        deletedAt: new Date(),
      },
    });
    const taras = await prisma.contact.create({
      data: {
        ...data,
        ownerId: tara.id,
        firstName: "Zed",
        lastName: "Hidden",
        email: "zed@northwind.example",
      },
    });

    const forRavi = (await defaults(asRavi, "COMPANY")).body as Envelope<{
      recipients: { name: string; contactId: string }[];
    }>;
    const forAdmin = (await defaults(asAdmin, "COMPANY")).body as typeof forRavi;

    expect(forRavi.data.recipients).toEqual([
      { name: "Anna Aziz", email: "anna@northwind.example", contactId: anna.id },
      { name: "Elena Rostova", email: "elena@northwind.example", contactId: contact.id },
    ]);
    expect(forAdmin.data.recipients.map((recipient) => recipient.contactId)).toEqual([
      anna.id,
      contact.id,
      taras.id,
    ]);
  });

  it("suggests nobody when there is no address, or the contact is not the caller's to see", async () => {
    await prisma.lead.update({ where: { id: lead.id }, data: { email: null } });
    await prisma.contact.update({ where: { id: contact.id }, data: { ownerId: tara.id } });

    expect((await defaults(asRavi, "LEAD")).body).toEqual({ data: { recipients: [] }, meta: {} });
    // Ravi still owns the opportunity, but no longer sees its contact.
    expect((await defaults(asRavi, "OPPORTUNITY")).body).toEqual({
      data: { recipients: [] },
      meta: {},
    });
  });

  it("is for everyone who may see the record, a Read-only user included", async () => {
    expect((await defaults(asViewer, "CONTACT")).status).toBe(200);
    expect((await defaults(asMeera, "CONTACT")).status).toBe(200);
    expect((await defaults(asTara, "CONTACT")).status).toBe(404);
    expect((await defaults(asRavi, "CONTACT", UNKNOWN_ID)).status).toBe(404);
    expect((await defaults(asRavi, "CONTACT", lead.id)).status).toBe(404);
  });

  it.each([
    ["no record type", `recordId=${UNKNOWN_ID}`, "recordType"],
    ["an unknown record type", `recordType=TASK&recordId=${UNKNOWN_ID}`, "recordType"],
    ["no record id", "recordType=LEAD", "recordId"],
    ["a record id that is not a uuid", "recordType=LEAD&recordId=7", "recordId"],
  ])("answers VALIDATION_FAILED for %s", async (_name, query, path) => {
    const response = await asRavi.get(`${EMAILS}/defaults?${query}`);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
  });
});

describe("POST /emails/preview", () => {
  it("fills in the placeholders without sending or writing anything", async () => {
    const send = await useFakeMailServer();

    const response = await asRavi.post(`${EMAILS}/preview`).send({
      record: { type: "CONTACT", id: contact.id },
      subject: "For {{contact.firstName}} at {{company.name}}",
      body: "{{opportunity.name}} {{contact.nickname}} {{quote.total}} {{sender.name}}",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        subject: "For Elena at Northwind Logistics",
        body: " {{contact.nickname}}  Ravi Rep",
        unknown: ["contact.nickname"],
        empty: ["opportunity.name", "quote.total"],
      },
      meta: {},
    });
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.timelineEntry.count()).toBe(0);
  });

  it("works while email is off and with an unfinished text", async () => {
    const response = await asRavi
      .post(`${EMAILS}/preview`)
      .send({ record: { type: "LEAD", id: lead.id }, subject: "", body: "" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { subject: "", body: "", unknown: [], empty: [] },
      meta: {},
    });
  });

  it("answers NOT_FOUND for a record outside the caller's reach", async () => {
    const response = await asTara
      .post(`${EMAILS}/preview`)
      .send({ record: { type: "CONTACT", id: contact.id }, subject: "x", body: "y" });

    expect(response.status).toBe(404);
  });
});
