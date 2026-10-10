import { createTransport } from "nodemailer";

import { env } from "../env";
import { logger } from "./logger";

export interface MailMessage {
  to: string;
  subject: string;
  // Plain text only: nothing a user typed is ever interpreted as markup.
  text: string;
}

type MailTransport = Pick<ReturnType<typeof createTransport>, "sendMail">;

// Outgoing mail is configured by environment variables and is off while SMTP_HOST is unset.
function buildTransport(): MailTransport | null {
  if (!env.SMTP_HOST) {
    return null;
  }
  return createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
    // A mail server that does not answer must not hold a request for long.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

const defaultTransport = buildTransport();

export function isMailConfigured(): boolean {
  return defaultTransport !== null;
}

// Returns whether the message was handed to the mail server. It never throws: when email
// is off or sending fails, the caller carries on and offers a link instead (D-10).
// Tests pass their own transport.
export async function sendMail(
  message: MailMessage,
  transport: MailTransport | null = defaultTransport,
): Promise<boolean> {
  if (!transport) {
    return false;
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM, ...message });
    return true;
  } catch (error) {
    // The message text holds a sign-in link, so only the error is logged.
    logger.error({ err: error }, "Sending email failed");
    return false;
  }
}
