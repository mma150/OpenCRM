import { formatPercent } from "@/lib/format";

import type { Product } from "./products.types";

// The tax rate of a product in words. A product without a rate of its own follows the
// organisation's default, which is named when it is known: "Default (8.25%)".
export function taxRateLabel(product: Product, defaultTaxRate: number | null): string {
  if (product.taxRate !== null) {
    return formatPercent(product.taxRate);
  }
  return defaultTaxRate === null ? "Default" : `Default (${formatPercent(defaultTaxRate)})`;
}

// Only an Admin changes the catalog; every other role reads it.
export function canManageProducts(role: string): boolean {
  return role === "ADMIN";
}
