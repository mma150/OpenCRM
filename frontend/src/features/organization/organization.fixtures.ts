import type { OrganizationSettings } from "./organization.types";

// Saved settings with every field filled in.
export const organization: OrganizationSettings = {
  name: "Northwind Fleet Solutions",
  address: "4200 Commerce Park Drive\nAustin, TX 78744",
  email: "sales@northwind.example",
  phone: "+1 512 555 0148",
  taxId: "EIN 74-1234567",
  defaultQuoteTerms: "Payment within 30 days.",
  defaultValidityDays: 30,
  defaultTaxRate: 8.25,
  invoicePaymentTermsDays: 14,
  updatedAt: "2026-10-01T09:00:00.000Z",
};

// What the API answers before an Admin has saved anything.
export const unsavedOrganization: OrganizationSettings = {
  name: "",
  address: null,
  email: null,
  phone: null,
  taxId: null,
  defaultQuoteTerms: null,
  defaultValidityDays: 30,
  defaultTaxRate: 0,
  invoicePaymentTermsDays: 30,
  updatedAt: null,
};
