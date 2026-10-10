import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { ApiOrganization, UpdateOrganizationBody } from "./organization.schema";

// The organisation's own details and the defaults of a new quote (QUOT-03). One row at
// most; until an Admin saves it, the defaults below apply.

const SETTINGS_ID = "default";

const DEFAULTS = {
  name: "",
  address: null,
  email: null,
  phone: null,
  taxId: null,
  defaultQuoteTerms: null,
  defaultValidityDays: 30,
  defaultTaxRate: new Prisma.Decimal(0),
  invoicePaymentTermsDays: 30,
  updatedAt: null,
};

// Exported for the quotes and invoices services, which read the defaults and the seller.
export async function findOrganization() {
  const saved = await prisma.organizationSettings.findUnique({ where: { id: SETTINGS_ID } });
  return saved ?? DEFAULTS;
}

export async function getOrganization(): Promise<ApiOrganization> {
  const settings = await findOrganization();
  return {
    name: settings.name,
    address: settings.address,
    email: settings.email,
    phone: settings.phone,
    taxId: settings.taxId,
    defaultQuoteTerms: settings.defaultQuoteTerms,
    defaultValidityDays: settings.defaultValidityDays,
    defaultTaxRate: settings.defaultTaxRate.toNumber(),
    invoicePaymentTermsDays: settings.invoicePaymentTermsDays,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}

export async function updateOrganization(input: UpdateOrganizationBody): Promise<ApiOrganization> {
  const data = {
    ...input,
    address: input.address ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    taxId: input.taxId ?? null,
    defaultQuoteTerms: input.defaultQuoteTerms ?? null,
  };
  await prisma.organizationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  return getOrganization();
}
