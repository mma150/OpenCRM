import type { Prisma, Product } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import {
  buildCsvExport,
  type CsvExport,
  type ExportColumn,
  exportWindow,
  momentFormatter,
} from "../../lib/csv-export";
import { escapeWildcards, type Page, pageWindow, searchWords } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import type {
  ApiProduct,
  CreateProductBody,
  ProductExportQuery,
  ProductListQuery,
  UpdateProductBody,
} from "./products.schema";

// QUOT-01: the product catalog. Every signed-in user reads it (a quote line is picked from
// it); the routes let only an Admin change it. A product is configuration, not an owned
// record: there is no owner and no soft delete. One that is on a quote can only be archived.

function toApiProduct(product: Product): ApiProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    unitPrice: product.unitPrice.toNumber(),
    taxRate: product.taxRate?.toNumber() ?? null,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

async function findProduct(id: string): Promise<Product> {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw new AppError("NOT_FOUND", 404, "Product not found");
  }
  return product;
}

// A SKU names one product, whatever the case and whether or not the other is archived.
async function assertSkuFree(sku: string | null | undefined, exceptId?: string): Promise<void> {
  if (!sku) {
    return;
  }
  const taken = await prisma.product.findFirst({
    where: { sku: { equals: escapeWildcards(sku), mode: "insensitive" }, id: { not: exceptId } },
  });
  if (taken) {
    throw fieldError("sku", "Another product already has this SKU");
  }
}

// What the list and the export share: the products that match, in order, within `window`.
async function findProducts(
  query: ProductListQuery,
  window: { skip: number; take: number },
): Promise<Page<ApiProduct>> {
  // Every word typed must appear in the name or the SKU.
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return { OR: [{ name: contains }, { sku: contains }] };
  });
  const where: Prisma.ProductWhereInput = {
    AND: [query.active === undefined ? {} : { active: query.active === "true" }, ...search],
  };
  const { sort, order } = query;
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      // A product without a SKU sorts last in both directions; `id` breaks ties.
      orderBy: [
        sort === "sku" ? { sku: { sort: order, nulls: "last" } } : { [sort]: order },
        { id: order },
      ],
      ...window,
    }),
    prisma.product.count({ where }),
  ]);
  return { items: products.map((product) => toApiProduct(product)), total };
}

export function listProducts(query: ProductListQuery): Promise<Page<ApiProduct>> {
  return findProducts(query, pageWindow(query));
}

// DATA-03: the catalog as a CSV file, for every signed-in user (everyone reads it), with the
// list's search, filter and sort. An empty tax rate means the organisation's default applies.
export async function exportProducts(query: ProductExportQuery): Promise<CsvExport> {
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiProduct>[] = [
    { header: "Name", value: (product) => product.name },
    { header: "SKU", value: (product) => product.sku },
    { header: "Description", value: (product) => product.description },
    { header: "Unit price", value: (product) => product.unitPrice },
    { header: "Tax rate", value: (product) => product.taxRate },
    { header: "Status", value: (product) => (product.active ? "Active" : "Archived") },
    { header: "Created", value: (product) => moment(product.createdAt) },
    { header: "Updated", value: (product) => moment(product.updatedAt) },
  ];
  return buildCsvExport(columns, await findProducts(query, exportWindow));
}

export async function getProduct(id: string): Promise<ApiProduct> {
  return toApiProduct(await findProduct(id));
}

export async function createProduct(input: CreateProductBody): Promise<ApiProduct> {
  await assertSkuFree(input.sku);
  return toApiProduct(await prisma.product.create({ data: input }));
}

export async function updateProduct(id: string, input: UpdateProductBody): Promise<ApiProduct> {
  await findProduct(id);
  await assertSkuFree(input.sku, id);
  return toApiProduct(await prisma.product.update({ where: { id }, data: input }));
}

// Archiving a product that is archived, or restoring one in use, answers with it unchanged.
export async function setProductActive(id: string, active: boolean): Promise<ApiProduct> {
  await findProduct(id);
  return toApiProduct(await prisma.product.update({ where: { id }, data: { active } }));
}

// Only a product no quote line was ever made from. The foreign key refuses anything else
// (also when a line is added at this very moment), which is answered as PRODUCT_IN_USE.
export async function deleteProduct(id: string): Promise<void> {
  await findProduct(id);
  const used = await prisma.quoteLine.count({ where: { productId: id } });
  if (used === 0) {
    const deleted = await prisma.product.delete({ where: { id } }).catch(() => null);
    if (deleted) {
      return;
    }
  }
  throw new AppError(
    "PRODUCT_IN_USE",
    409,
    "This product is on a quote, so it cannot be deleted. Archive it instead.",
  );
}
