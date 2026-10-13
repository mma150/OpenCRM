import type { components, paths } from "@/lib/api/schema";

type Schemas = components["schemas"];

// One entry of the product catalog. `taxRate` null means "the organisation's default".
// A product is configuration, not an owned record: no owner, and archived instead of deleted
// once a quote has used it.
export type Product = Schemas["Product"];
export type CreateProductInput = Schemas["CreateProductBody"];
export type UpdateProductInput = Schemas["UpdateProductBody"];

// Search, the Active / Archived filter, sort and page of GET /products.
export type ProductListQuery = NonNullable<paths["/products"]["get"]["parameters"]["query"]>;
export type ProductSort = NonNullable<ProductListQuery["sort"]>;

// Response bodies: { data, meta }.
export type ProductsResponse =
  paths["/products"]["get"]["responses"]["200"]["content"]["application/json"];
export type ProductResponse =
  paths["/products/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateProductResponse =
  paths["/products"]["post"]["responses"]["201"]["content"]["application/json"];

// What the slice keeps for the list: one page of products plus `meta` (page, pageSize, total).
export type ProductList = { products: Product[] } & Schemas["ListMeta"];
