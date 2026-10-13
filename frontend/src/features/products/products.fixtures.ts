import type { Product, ProductList, ProductListQuery } from "./products.types";

function product(position: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${String(position)}`,
    name,
    sku: null,
    description: null,
    unitPrice: 100,
    taxRate: null,
    active: true,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...extra,
  };
}

// A product with a rate of its own, one that follows the default, an untaxed one and an
// archived one.
export const licence = product(1, "Fleet tracking licence", {
  sku: "LIC-FLT-001",
  description: "Monthly subscription per vehicle",
  unitPrice: 29,
  taxRate: 20,
});
export const tracker = product(2, "GPS tracker hardware", { sku: "HW-GPS-4G", unitPrice: 149.99 });
export const onboarding = product(3, "Onboarding package", { unitPrice: 1200, taxRate: 0 });
export const legacy = product(4, "Legacy 3G tracker", { sku: "HW-GPS-3G", active: false });

export const allProducts: Product[] = [licence, tracker, onboarding, legacy];

export function productList(
  products: Product[],
  meta: Partial<{ page: number; pageSize: number; total: number }> = {},
): ProductList {
  return { products, page: 1, pageSize: 25, total: products.length, ...meta };
}

// What the page asks for at the plain address: the products in use, by name.
export const defaultQuery: ProductListQuery = {
  active: "true",
  sort: "name",
  order: "asc",
  page: 1,
  pageSize: 25,
};
