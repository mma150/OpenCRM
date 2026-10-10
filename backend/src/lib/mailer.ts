import { createTransport } from "nodemailer";

import { env } from "../env";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { decryptSecret } from "./secret-box";

// The only place that sends email. Which mail server is used is decided here, once, for
// everything the API sends (invites, password resets, reminders, emails a user sends from a
// record): the settings an Admin saved in the app, or else the SMTP_* environment variables,
// or else email is off.

// Not sent by anything yet (a quote goes out as text in v1); a PDF renderer adds its file here.
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string | string[];
  cc?: string[];
  subject: string;
  // Plain text only: nothing a user typed is ever interpreted as markup.
  text: string;
  // The name shown in front of the configured From address (a user's own name on an email
  // they send). The address itself always comes from the settings.
  fromName?: string;
  // Where an answer goes. Defaults to the settings' reply-to address, if there is one.
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailServer {
  // Where the settings come from: saved in the app, or the SMTP_* environment variables.
  source: "DATABASE" | "ENVIRONMENT";
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  // A password is stored but cannot be decrypted (SETTINGS_ENCRYPTION_KEY is missing or
  // was changed).
  passwordUnreadable: boolean;
  fromName: string | null;
  fromAddress: string;
  replyTo: string | null;
  updatedAt: Date | null;
}

type MailTransport = Pick<ReturnType<typeof createTransport>, "sendMail">;

// The row an Admin saves. There is at most one.
export const MAIL_SETTINGS_ID = "default";

// "OpenCRM <no-reply@example.com>" or a bare address.
function parseFrom(from: string): { name: string | null; address: string } {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from);
  if (!match) {
    return { name: null, address: from.trim() };
  }
  const name = (match[1] ?? "").replaceAll(/^"|"$/g, "");
  return { name: name || null, address: (match[2] ?? "").trim() };
}

// The mail server in effect, or null while email is off. Read on every use, so a change an
// Admin saves applies at once and in every API process.
export async function getMailServer(): Promise<MailServer | null> {
  const saved = await prisma.mailSettings.findUnique({ where: { id: MAIL_SETTINGS_ID } });
  if (saved) {
    const password = saved.passwordEncrypted ? decryptSecret(saved.passwordEncrypted) : null;
    return {
      source: "DATABASE",
      host: saved.host,
      port: saved.port,
      secure: saved.secure,
      username: saved.username,
      password,
      passwordUnreadable: saved.passwordEncrypted !== null && password === null,
      fromName: saved.fromName,
      fromAddress: saved.fromAddress,
      replyTo: saved.replyTo,
      updatedAt: saved.updatedAt,
    };
  }
  if (!env.SMTP_HOST) {
    return null;
  }
  // env.ts refuses to start with SMTP_HOST but without MAIL_FROM.
  const from = parseFrom(env.MAIL_FROM ?? "");
  return {
    source: "ENVIRONMENT",
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    username: env.SMTP_USER ?? null,
    password: env.SMTP_PASSWORD ?? null,
    passwordUnreadable: false,
    fromName: from.name,
    fromAddress: from.address,
    replyTo: null,
    updatedAt: null,
  };
}

export async function isMailConfigured(): Promise<boolean> {
  return (await getMailServer()) !== null;
}

// An object, so a test can stand in for the mail server with its own transport
// (test/helpers.ts) without a real one listening.
export const mailTransport = {
  create(server: MailServer): MailTransport {
    return createTransport({
      host: server.host,
      port: server.port,
      secure: server.secure,
      auth: server.username ? { user: server.username, pass: server.password ?? "" } : undefined,
      // A mail server that does not answer must not hold a request for long.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      // A message is built from text and buffers only: never from a path or an address the
      // API would have to read or fetch.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  },
};

// Why a message was not sent, in words that are safe to show. What the mail server itself
// said is never part of it: that goes to the log only.
export class MailError extends Error {
  readonly reason: "NOT_CONFIGURED" | "FAILED";

  constructor(reason: "NOT_CONFIGURED" | "FAILED", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MailError";
    this.reason = reason;
  }
}

const SMTP_PROBLEMS: Record<string, string> = {
  ECONNECTION: "Could not connect to the mail server. Check the host and the port.",
  ECONNREFUSED: "Could not connect to the mail server. Check the host and the port.",
  ESOCKET: "The connection to the mail server failed. Check the port and the encryption setting.",
  ETIMEDOUT: "The mail server did not answer in time. Check the host and the port.",
  EDNS: "The host name of the mail server was not found.",
  ENOTFOUND: "The host name of the mail server was not found.",
  EAUTH: "The mail server refused the username or password.",
  ETLS: "A secure connection to the mail server could not be set up. Check the encryption setting.",
  EENVELOPE: "The mail server refused the sender or a recipient address.",
};

// A sentence for the failure, from nodemailer's error code and the SMTP status number only.
function describeFailure(error: unknown): string {
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
  const problem =
    (typeof code === "string" ? SMTP_PROBLEMS[code] : undefined) ??
    "The mail server refused the message.";
  return typeof responseCode === "number" ? `${problem} (SMTP ${String(responseCode)})` : problem;
}

// Hands the message to the mail server, or throws a MailError that says why not. For an
// email a person asked for and waits on; everything else uses sendMail below.
export async function deliverMail(message: MailMessage): Promise<void> {
  const server = await getMailServer();
  if (!server) {
    throw new MailError("NOT_CONFIGURED", "Outgoing email is not set up");
  }
  if (server.passwordUnreadable) {
    throw new MailError(
      "FAILED",
      "The saved SMTP password cannot be read. Enter it again in the email settings.",
    );
  }
  const { fromName, replyTo, ...rest } = message;
  try {
    await mailTransport.create(server).sendMail({
      ...rest,
      from: { name: fromName ?? server.fromName ?? "", address: server.fromAddress },
      replyTo: replyTo ?? server.replyTo ?? undefined,
    });
  } catch (error) {
    // The message text may hold a sign-in link, so only the error is logged.
    logger.error({ err: error }, "Sending email failed");
    throw new MailError("FAILED", describeFailure(error), { cause: error });
  }
}

// Returns whether the message was handed to the mail server. It never throws: when email
// is off or sending fails, the caller carries on and offers a link instead (D-10).
export async function sendMail(message: MailMessage): Promise<boolean> {
  try {
    await deliverMail(message);
    return true;
  } catch (error) {
    if (!(error instanceof MailError)) {
      logger.error({ err: error }, "Sending email failed");
    }
    return false;
  }
}
