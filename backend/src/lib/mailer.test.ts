import { createTransport } from "nodemailer";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAIL_SERVER_TEXT,
  resetRecords,
  restoreEnv,
  setEnv,
  useFailingMailServer,
  useFakeMailServer,
} from "../../test/helpers";
import { inviteMessage, passwordResetMessage } from "./account-links";
import * as mailer from "./mailer";
import { deliverMail, getMailServer, isMailConfigured, MailError, sendMail } from "./mailer";
import { prisma } from "./prisma";
import { encryptSecret } from "./secret-box";

const message = { to: "asha@example.com", subject: "Hello", text: "A plain text body" };

beforeEach(async () => {
  await resetRecords();
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

afterAll(async () => {
  await resetRecords();
  await prisma.$disconnect();
});

describe("the mail server in effect", () => {
  it("is off while nothing is saved and SMTP_HOST is not set", async () => {
    expect(await getMailServer()).toBeNull();
    expect(await isMailConfigured()).toBe(false);
    expect(await sendMail(message)).toBe(false);
    await expect(deliverMail(message)).rejects.toMatchObject({ reason: "NOT_CONFIGURED" });
  });

  it("falls back to the SMTP_* environment variables, with MAIL_FROM split into name and address", async () => {
    setEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "from-the-environment",
    });

    expect(await getMailServer()).toEqual({
      source: "ENVIRONMENT",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "mailer",
      password: "from-the-environment",
      passwordUnreadable: false,
      fromName: "OpenCRM Test",
      fromAddress: "test@opencrm.local",
      replyTo: null,
      updatedAt: null,
    });
  });

  it("takes a bare address in MAIL_FROM as an address without a name", async () => {
    setEnv({ SMTP_HOST: "smtp.example.com", MAIL_FROM: "no-reply@example.com" });

    expect(await getMailServer()).toMatchObject({
      fromName: null,
      fromAddress: "no-reply@example.com",
    });
  });

  it("prefers the saved settings over the environment, and decrypts their password", async () => {
    setEnv({ SMTP_HOST: "smtp.example.com" });
    await prisma.mailSettings.create({
      data: {
        host: "mail.saved.example",
        port: 465,
        secure: true,
        username: "crm",
        passwordEncrypted: encryptSecret("saved-in-the-app"),
        fromName: "Northwind Sales",
        fromAddress: "sales@northwind.example",
        replyTo: "office@northwind.example",
      },
    });
    const create = vi
      .spyOn(mailer.mailTransport, "create")
      .mockReturnValue(createTransport({ jsonTransport: true }));

    expect(await sendMail(message)).toBe(true);

    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: "DATABASE",
        host: "mail.saved.example",
        port: 465,
        secure: true,
        username: "crm",
        password: "saved-in-the-app",
      }),
    );
  });

  it("refuses to send without the password when the stored one cannot be decrypted", async () => {
    await prisma.mailSettings.create({
      data: {
        host: "mail.saved.example",
        port: 587,
        username: "crm",
        passwordEncrypted: encryptSecret("saved-in-the-app", "x".repeat(32)),
        fromAddress: "sales@northwind.example",
      },
    });
    const create = vi.spyOn(mailer.mailTransport, "create");

    expect(await getMailServer()).toMatchObject({ password: null, passwordUnreadable: true });
    await expect(deliverMail(message)).rejects.toMatchObject({ reason: "FAILED" });
    expect(await sendMail(message)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("sendMail and deliverMail", () => {
  it("send with the configured name and address as the sender", async () => {
    const send = await useFakeMailServer();

    expect(await sendMail(message)).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      ...message,
      from: { name: "OpenCRM Test", address: "test@opencrm.local" },
      replyTo: undefined,
    });
  });

  it("put a sender's own name in front of the configured address, and their address in Reply-To", async () => {
    const send = await useFakeMailServer();

    await deliverMail({ ...message, fromName: "Ravi Rep", replyTo: "ravi@example.com" });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      ...message,
      from: { name: "Ravi Rep", address: "test@opencrm.local" },
      replyTo: "ravi@example.com",
    });
  });

  it("use the settings' reply-to address when the message names none", async () => {
    const send = await useFakeMailServer();
    await prisma.mailSettings.updateMany({ data: { replyTo: "office@opencrm.local" } });

    await deliverMail(message);

    expect(send.mock.calls[0]?.[0]).toMatchObject({ replyTo: "office@opencrm.local" });
  });

  it("builds a real transport with time-outs and without file or URL access", () => {
    const transport = mailer.mailTransport.create({
      source: "DATABASE",
      host: "127.0.0.1",
      port: 1,
      secure: false,
      username: null,
      password: null,
      passwordUnreadable: false,
      fromName: null,
      fromAddress: "test@opencrm.local",
      replyTo: null,
      updatedAt: null,
    }) as unknown as { options: Record<string, unknown> };

    expect(transport.options).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  });

  it("sendMail returns false instead of throwing when the mail server cannot be reached", async () => {
    await useFakeMailServer();
    // The real transport, pointed at a port where nothing listens.
    vi.spyOn(mailer.mailTransport, "create").mockReturnValue(
      createTransport({ host: "127.0.0.1", port: 1, connectionTimeout: 2000 }),
    );

    await expect(sendMail(message)).resolves.toBe(false);
  });

  it.each([
    ["ECONNECTION", "Could not connect to the mail server"],
    ["ETIMEDOUT", "did not answer in time"],
    ["EAUTH", "refused the username or password"],
    ["ETLS", "secure connection"],
    ["EENVELOPE", "refused the sender or a recipient"],
    ["ESOMETHINGELSE", "refused the message"],
  ])("deliverMail explains %s without repeating the mail server", async (code, words) => {
    await useFakeMailServer();
    useFailingMailServer(code);

    const error = await deliverMail(message).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MailError);
    const { reason, message: text } = error as MailError;
    expect(reason).toBe("FAILED");
    expect(text).toContain(words);
    expect(text).toContain("(SMTP 554)");
    expect(text).not.toContain(MAIL_SERVER_TEXT);
    expect(text).not.toContain("mail.internal");
  });
});

describe("account emails", () => {
  const user = { name: "Asha Rao", email: "asha@example.com" };
  const link = "http://localhost:3000/accept-invite?token=abc";

  it("writes the invite as plain text with the link on its own line", () => {
    const mail = inviteMessage(user, link);

    expect(mail.to).toBe("asha@example.com");
    expect(mail.text.split("\n")).toContain(link);
    expect(mail.text).toContain("Asha Rao");
    expect(mail.text).toContain("7 days");
  });

  it("writes the password reset the same way, with its one hour limit", () => {
    const mail = passwordResetMessage(user, link);

    expect(mail.to).toBe("asha@example.com");
    expect(mail.text.split("\n")).toContain(link);
    expect(mail.text).toContain("1 hour");
  });
});
