import type { EmailSettings } from "./email-settings.types";

// Saved by an Admin, with a login.
export const savedSettings: EmailSettings = {
  source: "DATABASE",
  host: "smtp.example.com",
  port: 587,
  secure: false,
  username: "mailer",
  hasPassword: true,
  fromName: "Northwind CRM",
  fromAddress: "crm@northwind.example",
  replyTo: "sales@northwind.example",
  updatedAt: "2026-10-01T09:00:00.000Z",
  canStorePassword: true,
  passwordUnreadable: false,
};

// From the server's SMTP_* variables: a mail server without login.
export const environmentSettings: EmailSettings = {
  source: "ENVIRONMENT",
  host: "mailpit",
  port: 1025,
  secure: false,
  username: null,
  hasPassword: false,
  fromName: "OpenCRM",
  fromAddress: "no-reply@opencrm.local",
  replyTo: null,
  updatedAt: null,
  canStorePassword: true,
  passwordUnreadable: false,
};

// Email is off.
export const noSettings: EmailSettings = {
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
};
