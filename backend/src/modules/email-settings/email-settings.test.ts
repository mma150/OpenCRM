import { createTransport } from "nodemailer";
import type request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  MAIL_SERVER_TEXT,
  resetDatabase,
  resetRecords,
  restoreEnv,
  setEnv,
  signInAs,
  useFailingMailServer,
  type ValidationDetail,
} from "../../../test/helpers";
import { createApp } from "../../app";
import * as mailer from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { decryptSecret } from "../../lib/secret-box";

interface Settings {
  source: string;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string | null;
  fromAddress: string | null;
  replyTo: string | null;
  updatedAt: string | null;
  canStorePassword: boolean;
  passwordUnreadable: boolean;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const SETTINGS = "/api/v1/settings/email";
const PASSWORD = "smtp-secret-9000";

const app = createTestApp();

let asAdmin: Agent;
let asManager: Agent;
let asRep: Agent;
let asViewer: Agent;

const valid = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  username: "crm@example.com",
  password: PASSWORD,
  fromName: "Northwind Sales",
  fromAddress: "Sales@Northwind.example",
  replyTo: "office@northwind.example",
};

function settingsOf(response: request.Response): Settings {
  return (response.body as Envelope<Settings>).data;
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

// Stands in for the mail server; returns what it was asked to send and how it was built.
function fakeTransport() {
  const transport = createTransport({ jsonTransport: true });
  const send = vi.spyOn(transport, "sendMail");
  const create = vi.spyOn(mailer.mailTransport, "create").mockReturnValue(transport);
  return { send, create };
}

beforeAll(async () => {
  await resetDatabase();
  asAdmin = await signInAs(app, await createUser({ role: "ADMIN", name: "Asha Admin" }));
  const manager = await createUser({ role: "SALES_MANAGER" });
  asManager = await signInAs(app, manager);
  asRep = await signInAs(app, await createUser({ role: "SALES_REP", managerId: manager.id }));
  asViewer = await signInAs(app, await createUser({ role: "READ_ONLY" }));
});

beforeEach(async () => {
  await resetRecords();
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("who may use the email settings", () => {
  it("lets only an Admin read, save, delete and test them", async () => {
    for (const agent of [asManager, asRep, asViewer]) {
      const responses = await Promise.all([
        agent.get(SETTINGS),
        agent.put(SETTINGS).send(valid),
        agent.delete(SETTINGS),
        agent.post(`${SETTINGS}/test`).send({ to: "someone@example.com" }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
      expect(responses.map((response) => errorOf(response).code)).toEqual(
        Array.from({ length: 4 }, () => "FORBIDDEN"),
      );
    }
    expect(await prisma.mailSettings.count()).toBe(0);
  });

  it("tells every signed-in user whether email is on", async () => {
    for (const agent of [asAdmin, asManager, asRep, asViewer]) {
      const response = await agent.get(`${SETTINGS}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { enabled: false }, meta: {} });
    }

    await asAdmin.put(SETTINGS).send(valid);

    expect((await asRep.get(`${SETTINGS}/status`)).body).toEqual({
      data: { enabled: true },
      meta: {},
    });
    expect((await asViewer.get(`${SETTINGS}/status`)).body).toEqual({
      data: { enabled: true },
      meta: {},
    });
  });
});

describe("GET /settings/email", () => {
  it("answers source NONE while nothing is saved and no SMTP_HOST is set", async () => {
    const response = await asAdmin.get(SETTINGS);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        source: "NONE",
        host: null,
        port: null,
        secure: false,
        username: null,
        hasPassword: false,
        fromName: null,
        fromAddress: null,
        replyTo: null,
        updatedAt: null,
        canStorePassword: true,
        passwordUnreadable: false,
      },
      meta: {},
    });
  });

  it("shows the SMTP_* environment variables when nothing is saved, without the password", async () => {
    setEnv({
      SMTP_HOST: "smtp.env.example",
      SMTP_PORT: 2525,
      SMTP_USER: "env-user",
      SMTP_PASSWORD: "env-password-123",
    });

    const response = await asAdmin.get(SETTINGS);

    expect(settingsOf(response)).toEqual({
      source: "ENVIRONMENT",
      host: "smtp.env.example",
      port: 2525,
      secure: false,
      username: "env-user",
      hasPassword: true,
      fromName: "OpenCRM Test",
      fromAddress: "test@opencrm.local",
      replyTo: null,
      updatedAt: null,
      canStorePassword: true,
      passwordUnreadable: false,
    });
    expect(response.text).not.toContain("env-password-123");
    expect((await asRep.get(`${SETTINGS}/status`)).body).toMatchObject({ data: { enabled: true } });
    expect((await asAdmin.get("/api/v1/users")).body).toMatchObject({
      meta: { mailEnabled: true },
    });
  });
});

describe("PUT /settings/email", () => {
  it("saves the settings, which then win over the environment", async () => {
    setEnv({ SMTP_HOST: "smtp.env.example" });

    const response = await asAdmin.put(SETTINGS).send(valid);

    expect(response.status).toBe(200);
    expect(settingsOf(response)).toEqual({
      source: "DATABASE",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "crm@example.com",
      hasPassword: true,
      fromName: "Northwind Sales",
      // Trimmed and lowercased, like every email address.
      fromAddress: "sales@northwind.example",
      replyTo: "office@northwind.example",
      updatedAt: expect.any(String) as string,
      canStorePassword: true,
      passwordUnreadable: false,
    });
    expect(settingsOf(await asAdmin.get(SETTINGS))).toEqual(settingsOf(response));
  });

  it("never returns the password, and stores it encrypted", async () => {
    const saved = await asAdmin.put(SETTINGS).send(valid);
    const read = await asAdmin.get(SETTINGS);
    const row = await prisma.mailSettings.findFirstOrThrow();

    expect(saved.text).not.toContain(PASSWORD);
    expect(read.text).not.toContain(PASSWORD);
    expect(saved.text).not.toContain(row.passwordEncrypted);
    expect(Object.keys(settingsOf(read))).not.toContain("password");
    expect(row.passwordEncrypted).toMatch(/^v1:/);
    expect(row.passwordEncrypted).not.toContain(PASSWORD);
    expect(decryptSecret(row.passwordEncrypted ?? "")).toBe(PASSWORD);
  });

  it("keeps the stored password when none is sent, and removes it for null", async () => {
    await asAdmin.put(SETTINGS).send(valid);
    const before = await prisma.mailSettings.findFirstOrThrow();

    // JSON leaves out a key that is undefined.
    const kept = await asAdmin.put(SETTINGS).send({ ...valid, password: undefined, port: 2525 });
    const afterKeeping = await prisma.mailSettings.findFirstOrThrow();

    expect(settingsOf(kept)).toMatchObject({ port: 2525, hasPassword: true });
    expect(afterKeeping.passwordEncrypted).toBe(before.passwordEncrypted);

    const cleared = await asAdmin.put(SETTINGS).send({ ...valid, password: null });

    expect(settingsOf(cleared).hasPassword).toBe(false);
    expect((await prisma.mailSettings.findFirstOrThrow()).passwordEncrypted).toBeNull();
  });

  it("removes the password together with the username", async () => {
    await asAdmin.put(SETTINGS).send(valid);

    const response = await asAdmin
      .put(SETTINGS)
      .send({ ...valid, password: undefined, username: undefined });

    expect(settingsOf(response)).toMatchObject({ username: null, hasPassword: false });
    expect((await prisma.mailSettings.findFirstOrThrow()).passwordEncrypted).toBeNull();
  });

  it("replaces the settings: what is left out is cleared", async () => {
    await asAdmin.put(SETTINGS).send(valid);

    const response = await asAdmin
      .put(SETTINGS)
      .send({ host: "mailpit", port: 1025, fromAddress: "no-reply@opencrm.local" });

    expect(settingsOf(response)).toMatchObject({
      host: "mailpit",
      port: 1025,
      secure: false,
      username: null,
      hasPassword: false,
      fromName: null,
      replyTo: null,
    });
    expect(await prisma.mailSettings.count()).toBe(1);
  });

  it("refuses a password without a username, on the username", async () => {
    const response = await asAdmin.put(SETTINGS).send({ ...valid, username: undefined });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["username"]);
    expect(await prisma.mailSettings.count()).toBe(0);
  });

  it.each([
    ["a missing host", { host: undefined }, "host"],
    ["a host with a scheme", { host: "smtp://smtp.example.com" }, "host"],
    ["a host with a path", { host: "smtp.example.com/inbox" }, "host"],
    ["a host with a space", { host: "smtp example.com" }, "host"],
    ["a host with a login", { host: "user@smtp.example.com" }, "host"],
    ["port 0", { port: 0 }, "port"],
    ["port 65536", { port: 65_536 }, "port"],
    ["a port as text", { port: "587" }, "port"],
    ["a missing from address", { fromAddress: undefined }, "fromAddress"],
    [
      "a from address that is not an email",
      { fromAddress: "Sales <sales@x.example>" },
      "fromAddress",
    ],
    ["a from name with an angle bracket", { fromName: "Sales <x@y.example>" }, "fromName"],
    ["a from name with a line break", { fromName: "Sales\r\nBcc: x@y.example" }, "fromName"],
    ["a reply-to that is not an email", { replyTo: "office" }, "replyTo"],
    ["an empty password", { password: "" }, "password"],
    ["secure as text", { secure: "yes" }, "secure"],
  ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
    const response = await asAdmin.put(SETTINGS).send({ ...valid, ...change });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.mailSettings.count()).toBe(0);
  });

  it.each(["smtp.example.com", "mailpit", "10.0.0.5", "[2001:db8::25]", "mail-1.internal"])(
    "accepts the host %s",
    async (host) => {
      const response = await asAdmin.put(SETTINGS).send({ ...valid, host });

      expect(response.status).toBe(200);
      expect(settingsOf(response).host).toBe(host);
    },
  );
});

describe("without SETTINGS_ENCRYPTION_KEY", () => {
  beforeEach(() => {
    setEnv({ SETTINGS_ENCRYPTION_KEY: undefined });
  });

  it("refuses to save a password with ENCRYPTION_KEY_MISSING, and stores nothing", async () => {
    const response = await asAdmin.put(SETTINGS).send(valid);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "ENCRYPTION_KEY_MISSING",
        message: "Set SETTINGS_ENCRYPTION_KEY in the server's environment before saving a password",
        details: null,
      },
    });
    expect(await prisma.mailSettings.count()).toBe(0);
  });

  it("still saves a mail server that needs no login, and says a password cannot be stored", async () => {
    const response = await asAdmin
      .put(SETTINGS)
      .send({ host: "mailpit", port: 1025, fromAddress: "no-reply@opencrm.local" });

    expect(response.status).toBe(200);
    expect(settingsOf(response)).toMatchObject({ source: "DATABASE", canStorePassword: false });
  });

  it("reports a stored password it can no longer read, and keeps hasPassword true", async () => {
    restoreEnv();
    await asAdmin.put(SETTINGS).send(valid);
    setEnv({ SETTINGS_ENCRYPTION_KEY: undefined });

    const settings = settingsOf(await asAdmin.get(SETTINGS));
    const test = await asAdmin.post(`${SETTINGS}/test`).send({ to: "asha@example.com" });

    expect(settings).toMatchObject({ hasPassword: true, passwordUnreadable: true });
    expect(test.status).toBe(502);
    expect(errorOf(test).code).toBe("EMAIL_SEND_FAILED");
    expect(errorOf(test).message).toContain("cannot be read");
  });
});

describe("DELETE /settings/email", () => {
  it("goes back to no email when the environment names no mail server", async () => {
    await asAdmin.put(SETTINGS).send(valid);

    const response = await asAdmin.delete(SETTINGS);

    expect(response.status).toBe(200);
    expect(settingsOf(response)).toMatchObject({ source: "NONE", host: null, hasPassword: false });
    expect(await prisma.mailSettings.count()).toBe(0);
    expect((await asRep.get(`${SETTINGS}/status`)).body).toMatchObject({
      data: { enabled: false },
    });
  });

  it("goes back to the environment variables when they name one", async () => {
    setEnv({ SMTP_HOST: "smtp.env.example" });
    await asAdmin.put(SETTINGS).send(valid);

    const response = await asAdmin.delete(SETTINGS);

    expect(settingsOf(response)).toMatchObject({ source: "ENVIRONMENT", host: "smtp.env.example" });
  });

  it("answers the same when nothing was saved", async () => {
    const response = await asAdmin.delete(SETTINGS);

    expect(response.status).toBe(200);
    expect(settingsOf(response).source).toBe("NONE");
  });
});

describe("POST /settings/email/test", () => {
  it("sends a test message with the saved settings, password decrypted", async () => {
    await asAdmin.put(SETTINGS).send(valid);
    const { send, create } = fakeTransport();

    const response = await asAdmin.post(`${SETTINGS}/test`).send({ to: " Asha@Example.com " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { sent: true, to: "asha@example.com" }, meta: {} });
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: "DATABASE",
        host: "smtp.example.com",
        port: 587,
        username: "crm@example.com",
        password: PASSWORD,
      }),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith({
      to: "asha@example.com",
      subject: "OpenCRM test email",
      text: expect.stringContaining("outgoing email works") as string,
      from: { name: "Northwind Sales", address: "sales@northwind.example" },
      replyTo: "office@northwind.example",
    });
  });

  it("answers EMAIL_NOT_CONFIGURED when there is no mail server", async () => {
    const response = await asAdmin.post(`${SETTINGS}/test`).send({ to: "asha@example.com" });

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe("EMAIL_NOT_CONFIGURED");
    expect(errorOf(response).details).toBeNull();
  });

  it.each([
    ["ECONNECTION", "Could not connect to the mail server"],
    ["EAUTH", "refused the username or password"],
    ["ETIMEDOUT", "did not answer in time"],
  ])("answers EMAIL_SEND_FAILED for %s, in its own words", async (code, words) => {
    await asAdmin.put(SETTINGS).send(valid);
    useFailingMailServer(code);

    const response = await asAdmin.post(`${SETTINGS}/test`).send({ to: "asha@example.com" });

    expect(response.status).toBe(502);
    expect(errorOf(response).code).toBe("EMAIL_SEND_FAILED");
    expect(errorOf(response).message).toContain(words);
    expect(errorOf(response).message).toContain("(SMTP 554)");
    // Nothing the mail server said, and nothing secret, reaches the answer.
    expect(response.text).not.toContain(MAIL_SERVER_TEXT);
    expect(response.text).not.toContain("mail.internal");
    expect(response.text).not.toContain(PASSWORD);
  });

  it("answers VALIDATION_FAILED for an address that is not an email", async () => {
    const response = await asAdmin.post(`${SETTINGS}/test`).send({ to: "asha" });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["to"]);
  });

  it("counts towards the caller's sending limit", async () => {
    const limited = createApp({ rateLimit: { sendLimit: 2 } });
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    const agent = await signInAs(limited, admin);
    await agent.put(SETTINGS).send(valid);
    fakeTransport();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await agent.post(`${SETTINGS}/test`).send({ to: "asha@example.com" });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe("the saved settings and the rest of the app", () => {
  it("are what an invite is sent with", async () => {
    await asAdmin.put(SETTINGS).send(valid);
    const { send } = fakeTransport();

    const response = await asAdmin
      .post("/api/v1/users")
      .send({ name: "Nina New", email: "nina@example.com", role: "SALES_REP" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { invite: { emailed: true, link: null } } });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: "nina@example.com",
        from: { name: "Northwind Sales", address: "sales@northwind.example" },
        replyTo: "office@northwind.example",
      }),
    );
    expect((await asAdmin.get("/api/v1/users")).body).toMatchObject({
      meta: { mailEnabled: true },
    });
  });

  it("hand the Admin a link instead when the saved mail server fails", async () => {
    await asAdmin.put(SETTINGS).send(valid);
    useFailingMailServer();

    const response = await asAdmin
      .post("/api/v1/users")
      .send({ name: "Omar Other", email: "omar.other@example.com", role: "SALES_REP" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { invite: { emailed: false } } });
  });
});
