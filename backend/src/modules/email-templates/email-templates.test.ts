import type request from "supertest";
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
import type { User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { renderPlaceholders } from "./email-templates.service";

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  shared: boolean;
  owner: { id: string; name: string };
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const TEMPLATES = "/api/v1/email-templates";
const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";

const app = createTestApp();

let admin: User;
let meera: User;
let ravi: User;
let tara: User;
let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asTara: Agent;
let asViewer: Agent;

const followUp = {
  name: "Follow-up after demo",
  subject: "Good to meet you, {{contact.firstName}}",
  body: "Hi {{contact.firstName}},\n\nThank you for your time today.\n\n{{sender.name}}",
};

function templateOf(response: request.Response): Template {
  return (response.body as Envelope<Template>).data;
}

function namesOf(response: request.Response): string[] {
  return (response.body as Envelope<Template[]>).data.map((template) => template.name);
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

async function make(agent: Agent, body: Record<string, unknown> = {}): Promise<Template> {
  const response = await agent.post(TEMPLATES).send({ ...followUp, ...body });
  expect(response.status).toBe(201);
  return templateOf(response);
}

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ role: "ADMIN", name: "Asha Admin" });
  meera = await createUser({ role: "SALES_MANAGER", name: "Meera Manager" });
  ravi = await createUser({ role: "SALES_REP", name: "Ravi Rep", managerId: meera.id });
  tara = await createUser({ role: "SALES_REP", name: "Tara Rep" });
  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asTara = await signInAs(app, tara);
  asViewer = await signInAs(app, await createUser({ role: "READ_ONLY" }));
});

beforeEach(async () => {
  await resetRecords();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("POST /email-templates", () => {
  it("creates a private template owned by the caller", async () => {
    const response = await asRavi.post(TEMPLATES).send(followUp);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String) as string,
        ...followUp,
        shared: false,
        owner: { id: ravi.id, name: "Ravi Rep" },
        editable: true,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      },
      meta: {},
    });
  });

  it("lets an Admin and a Sales Manager share a template, and nobody else", async () => {
    expect((await make(asAdmin, { shared: true })).shared).toBe(true);
    expect((await make(asMeera, { shared: true })).shared).toBe(true);

    const response = await asRavi.post(TEMPLATES).send({ ...followUp, shared: true });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.emailTemplate.count({ where: { ownerId: ravi.id } })).toBe(0);
  });

  it("refuses a Read-only user", async () => {
    const response = await asViewer.post(TEMPLATES).send(followUp);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it("refuses a name the caller already uses, whatever the case, but not someone else's", async () => {
    await make(asRavi);

    const again = await asRavi.post(TEMPLATES).send({ ...followUp, name: "FOLLOW-UP AFTER DEMO" });
    const other = await asTara.post(TEMPLATES).send(followUp);

    expect(again.status).toBe(400);
    expect(detailPaths(again)).toEqual(["name"]);
    expect(other.status).toBe(201);
  });

  it("stops at 200 templates for one user", async () => {
    await prisma.emailTemplate.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        name: `Template ${String(index)}`,
        subject: "s",
        body: "b",
        ownerId: ravi.id,
      })),
    });

    const response = await asRavi.post(TEMPLATES).send(followUp);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(errorOf(response).details).toBeNull();
    expect((await asTara.post(TEMPLATES).send(followUp)).status).toBe(201);
  });

  it.each([
    ["a missing name", { name: undefined }, "name"],
    ["a name of spaces", { name: "   " }, "name"],
    ["a name of 101 characters", { name: "n".repeat(101) }, "name"],
    ["a missing subject", { subject: undefined }, "subject"],
    ["a subject of 201 characters", { subject: "s".repeat(201) }, "subject"],
    ["a subject with a line break", { subject: "Hello\nBcc: x@y.example" }, "subject"],
    ["an empty body", { body: "" }, "body"],
    ["a body of 20001 characters", { body: "b".repeat(20_001) }, "body"],
    ["shared as text", { shared: "yes" }, "shared"],
  ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
    const response = await asAdmin.post(TEMPLATES).send({ ...followUp, ...change });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
  });

  it("does not let a request choose the owner", async () => {
    const response = await asRavi.post(TEMPLATES).send({ ...followUp, ownerId: tara.id });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /email-templates", () => {
  it("lists the caller's own templates and every shared one, by name", async () => {
    await make(asRavi, { name: "Ravi's own" });
    await make(asTara, { name: "Tara's own" });
    await make(asAdmin, { name: "Admin's own" });
    await make(asAdmin, { name: "Company intro", shared: true });
    await make(asMeera, { name: "Meera's team note", shared: true });

    expect(namesOf(await asRavi.get(TEMPLATES))).toEqual([
      "Company intro",
      "Meera's team note",
      "Ravi's own",
    ]);
    expect(namesOf(await asTara.get(TEMPLATES))).toEqual([
      "Company intro",
      "Meera's team note",
      "Tara's own",
    ]);
    // An Admin does not see other people's private templates either.
    expect(namesOf(await asAdmin.get(TEMPLATES))).toEqual([
      "Admin's own",
      "Company intro",
      "Meera's team note",
    ]);
    // A Read-only user owns none, and may read the shared ones.
    expect(namesOf(await asViewer.get(TEMPLATES))).toEqual(["Company intro", "Meera's team note"]);
  });

  it("says for each template whether the caller may change it", async () => {
    await make(asRavi, { name: "Mine" });
    await make(asMeera, { name: "Shared by Meera", shared: true });
    const editable = async (agent: Agent) =>
      Object.fromEntries(
        (
          await agent.get(TEMPLATES).then((response) => response.body as Envelope<Template[]>)
        ).data.map((template) => [template.name, template.editable]),
      );

    expect(await editable(asRavi)).toEqual({ Mine: true, "Shared by Meera": false });
    expect(await editable(asMeera)).toEqual({ "Shared by Meera": true });
    expect(await editable(asAdmin)).toEqual({ "Shared by Meera": true });
    expect(await editable(asViewer)).toEqual({ "Shared by Meera": false });
  });
});

describe("GET /email-templates/:id", () => {
  it("answers with an own or a shared template", async () => {
    const own = await make(asRavi);
    const shared = await make(asAdmin, { shared: true });

    expect(templateOf(await asRavi.get(`${TEMPLATES}/${own.id}`)).id).toBe(own.id);
    expect(templateOf(await asRavi.get(`${TEMPLATES}/${shared.id}`))).toMatchObject({
      id: shared.id,
      editable: false,
      owner: { id: admin.id, name: "Asha Admin" },
    });
  });

  it("answers NOT_FOUND for another user's private template, an Admin included, like an unknown id", async () => {
    const own = await make(asRavi);

    const responses = await Promise.all([
      asTara.get(`${TEMPLATES}/${own.id}`),
      asMeera.get(`${TEMPLATES}/${own.id}`),
      asAdmin.get(`${TEMPLATES}/${own.id}`),
      asAdmin.get(`${TEMPLATES}/${UNKNOWN_ID}`),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(responses[3].body);
    }
  });
});

describe("PATCH /email-templates/:id", () => {
  it("changes only the keys that are sent", async () => {
    const template = await make(asRavi);

    const response = await asRavi.patch(`${TEMPLATES}/${template.id}`).send({ body: "New text" });

    expect(response.status).toBe(200);
    expect(templateOf(response)).toMatchObject({ ...followUp, body: "New text", shared: false });
  });

  it("lets the owner and an Admin change a shared template, and nobody else", async () => {
    const shared = await make(asMeera, { shared: true });

    const byRep = await asRavi.patch(`${TEMPLATES}/${shared.id}`).send({ name: "Mine now" });
    const byViewer = await asViewer.patch(`${TEMPLATES}/${shared.id}`).send({ name: "Mine now" });
    const byAdmin = await asAdmin.patch(`${TEMPLATES}/${shared.id}`).send({ name: "Tidied up" });
    const byOwner = await asMeera.patch(`${TEMPLATES}/${shared.id}`).send({ subject: "Hello" });

    expect([byRep.status, byViewer.status]).toEqual([403, 403]);
    expect(errorOf(byRep).code).toBe("FORBIDDEN");
    expect(templateOf(byAdmin)).toMatchObject({ name: "Tidied up", owner: { id: meera.id } });
    expect(templateOf(byOwner)).toMatchObject({ name: "Tidied up", subject: "Hello" });
  });

  it("answers NOT_FOUND for another user's private template", async () => {
    const template = await make(asRavi);

    const response = await asAdmin.patch(`${TEMPLATES}/${template.id}`).send({ name: "x" });

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
  });

  it("lets only an Admin or a Sales Manager turn sharing on, and anyone turn their own off", async () => {
    const ofRavi = await make(asRavi);
    const ofMeera = await make(asMeera);

    const byRep = await asRavi.patch(`${TEMPLATES}/${ofRavi.id}`).send({ shared: true });
    const byManager = await asMeera.patch(`${TEMPLATES}/${ofMeera.id}`).send({ shared: true });
    const off = await asMeera.patch(`${TEMPLATES}/${ofMeera.id}`).send({ shared: false });
    const stillPrivate = await asRavi.patch(`${TEMPLATES}/${ofRavi.id}`).send({ shared: false });

    expect(byRep.status).toBe(403);
    expect(templateOf(byManager).shared).toBe(true);
    expect(templateOf(off).shared).toBe(false);
    expect(stillPrivate.status).toBe(200);
  });

  it("refuses a name its owner already uses", async () => {
    await make(asRavi, { name: "First" });
    const second = await make(asRavi, { name: "Second" });

    const taken = await asRavi.patch(`${TEMPLATES}/${second.id}`).send({ name: "first" });
    const same = await asRavi.patch(`${TEMPLATES}/${second.id}`).send({ name: "SECOND" });

    expect(taken.status).toBe(400);
    expect(detailPaths(taken)).toEqual(["name"]);
    expect(templateOf(same).name).toBe("SECOND");
  });
});

describe("DELETE /email-templates/:id", () => {
  it("deletes an own template for real", async () => {
    const template = await make(asRavi);

    const response = await asRavi.delete(`${TEMPLATES}/${template.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect(await prisma.emailTemplate.count()).toBe(0);
  });

  it("follows the same rules as changing one", async () => {
    const shared = await make(asMeera, { shared: true });
    const own = await make(asRavi, { name: "Ravi's own" });

    expect((await asRavi.delete(`${TEMPLATES}/${shared.id}`)).status).toBe(403);
    expect((await asViewer.delete(`${TEMPLATES}/${shared.id}`)).status).toBe(403);
    expect((await asTara.delete(`${TEMPLATES}/${own.id}`)).status).toBe(404);
    expect((await asAdmin.delete(`${TEMPLATES}/${own.id}`)).status).toBe(404);
    expect(await prisma.emailTemplate.count()).toBe(2);
    expect((await asAdmin.delete(`${TEMPLATES}/${shared.id}`)).status).toBe(200);
    expect(await prisma.emailTemplate.count()).toBe(1);
  });
});

describe("GET /email-templates/placeholders", () => {
  it("publishes the supported placeholders to every role", async () => {
    for (const agent of [asAdmin, asRavi, asViewer]) {
      const response = await agent.get(`${TEMPLATES}/placeholders`);
      const body = response.body as Envelope<{ key: string; token: string; label: string }[]>;

      expect(response.status).toBe(200);
      expect(body.data.map((placeholder) => placeholder.key)).toEqual([
        "contact.firstName",
        "contact.lastName",
        "company.name",
        "opportunity.name",
        "sender.name",
        "sender.email",
        "quote.number",
        "quote.total",
      ]);
      expect(body.data[0]).toEqual({
        key: "contact.firstName",
        token: "{{contact.firstName}}",
        label: "Contact's first name",
        description: expect.any(String) as string,
      });
    }
  });
});

describe("renderPlaceholders", () => {
  const values = {
    "contact.firstName": "Elena",
    "contact.lastName": "Rostova",
    "company.name": null,
    "sender.name": "Ravi Rep",
  };

  it("fills in what it knows, with or without spaces in the brackets", () => {
    expect(
      renderPlaceholders(
        "Hi {{contact.firstName}} {{ contact.lastName }}, from {{sender.name}}",
        values,
      ),
    ).toEqual({ text: "Hi Elena Rostova, from Ravi Rep", unknown: [], empty: [] });
  });

  it("leaves a placeholder it does not know exactly as typed, and reports it once", () => {
    expect(
      renderPlaceholders(
        "{{contact.nickname}} and {{ contact.nickname }} and {{Contact.FirstName}}",
        values,
      ),
    ).toEqual({
      text: "{{contact.nickname}} and {{ contact.nickname }} and {{Contact.FirstName}}",
      unknown: ["contact.nickname", "Contact.FirstName"],
      empty: [],
    });
  });

  it("replaces a known placeholder without a value by nothing, and reports it", () => {
    expect(renderPlaceholders("At {{company.name}} about {{opportunity.name}}.", values)).toEqual({
      text: "At  about .",
      unknown: [],
      empty: ["company.name", "opportunity.name"],
    });
  });

  it("does not fill in a value twice, and leaves other brackets alone", () => {
    expect(
      renderPlaceholders("{{contact.firstName}} { {contact.firstName} } {{}} {{ 1+1 }}", {
        "contact.firstName": "{{sender.name}}",
        "sender.name": "Ravi",
      }),
    ).toEqual({
      text: "{{sender.name}} { {contact.firstName} } {{}} {{ 1+1 }}",
      unknown: [],
      empty: [],
    });
  });
});
