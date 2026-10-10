import { createTransport } from "nodemailer";
import { describe, expect, it, vi } from "vitest";

import { inviteMessage, passwordResetMessage } from "./account-links";
import { isMailConfigured, sendMail } from "./mailer";

const message = { to: "asha@example.com", subject: "Hello", text: "A plain text body" };

describe("sendMail", () => {
  it("is switched off while SMTP_HOST is not set, and reports the message as not sent", async () => {
    expect(isMailConfigured()).toBe(false);
    expect(await sendMail(message)).toBe(false);
  });

  it("sends through the transport with MAIL_FROM as the sender and reports success", async () => {
    // nodemailer's own in-memory transport: builds the message, sends nothing.
    const transport = createTransport({ jsonTransport: true });
    const send = vi.spyOn(transport, "sendMail");

    expect(await sendMail(message, transport)).toBe(true);
    expect(send).toHaveBeenCalledWith({
      from: "OpenCRM Test <test@opencrm.local>",
      ...message,
    });
  });

  it("returns false instead of throwing when the mail server cannot be reached", async () => {
    // Nothing listens on port 1.
    const transport = createTransport({ host: "127.0.0.1", port: 1, connectionTimeout: 2000 });

    await expect(sendMail(message, transport)).resolves.toBe(false);
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
