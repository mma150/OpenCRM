import { fieldError } from "../../lib/app-error";
import { getMailServer, isMailConfigured, MAIL_SETTINGS_ID } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { canEncryptSecrets, encryptSecret } from "../../lib/secret-box";
import { deliverEmail } from "../emails/emails.service";
import type {
  ApiEmailSettings,
  EmailStatus,
  TestEmailResult,
  UpdateEmailSettingsBody,
} from "./email-settings.schema";

// MAIL-01: the outgoing mail server. What an Admin saves here wins over the SMTP_*
// environment variables; deleting it goes back to them. lib/mailer.ts reads the result for
// every email the API sends.

export async function getEmailStatus(): Promise<EmailStatus> {
  return { enabled: await isMailConfigured() };
}

// The password never leaves the server: only whether there is one.
export async function getEmailSettings(): Promise<ApiEmailSettings> {
  const server = await getMailServer();
  return {
    source: server?.source ?? "NONE",
    host: server?.host ?? null,
    port: server?.port ?? null,
    secure: server?.secure ?? false,
    username: server?.username ?? null,
    hasPassword: server ? server.password !== null || server.passwordUnreadable : false,
    fromName: server?.fromName ?? null,
    fromAddress: server?.fromAddress ?? null,
    replyTo: server?.replyTo ?? null,
    updatedAt: server?.updatedAt?.toISOString() ?? null,
    canStorePassword: canEncryptSecrets(),
    passwordUnreadable: server?.passwordUnreadable ?? false,
  };
}

export async function saveEmailSettings(input: UpdateEmailSettingsBody): Promise<ApiEmailSettings> {
  const { password, ...fields } = input;
  const username = fields.username ?? null;
  if (password && !username) {
    throw fieldError("username", "Enter the username the password belongs to");
  }

  const saved = await prisma.mailSettings.findUnique({ where: { id: MAIL_SETTINGS_ID } });
  // A password is only ever stored encrypted: without a key this throws
  // ENCRYPTION_KEY_MISSING and nothing is saved.
  let passwordEncrypted = password ? encryptSecret(password) : null;
  if (password === undefined && username !== null) {
    passwordEncrypted = saved?.passwordEncrypted ?? null;
  }

  const data = {
    ...fields,
    username,
    passwordEncrypted,
    fromName: fields.fromName ?? null,
    replyTo: fields.replyTo ?? null,
  };
  await prisma.mailSettings.upsert({
    where: { id: MAIL_SETTINGS_ID },
    create: { id: MAIL_SETTINGS_ID, ...data },
    update: data,
  });
  return getEmailSettings();
}

// Back to the environment variables, or to no email at all.
export async function deleteEmailSettings(): Promise<ApiEmailSettings> {
  await prisma.mailSettings.deleteMany();
  return getEmailSettings();
}

// Sends one message with the settings in effect and waits for the mail server's answer, so
// the Admin learns at once whether they work.
export async function sendTestEmail(to: string): Promise<TestEmailResult> {
  await deliverEmail({
    to,
    subject: "OpenCRM test email",
    text: "This is a test message from OpenCRM. If you can read it, outgoing email works.",
  });
  return { sent: true, to };
}
