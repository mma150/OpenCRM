import { Router } from "express";

import {
  csvResponse,
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { deletedResponseSchema, recordIdParamsSchema } from "../../lib/record-fields";
import { CSV_EXPORT } from "../../lib/route-docs";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import {
  archiveProductHandler,
  createProductHandler,
  deleteProductHandler,
  exportProductsHandler,
  getProductHandler,
  listProductsHandler,
  restoreProductHandler,
  updateProductHandler,
} from "./products.controller";
import {
  createProductBodySchema,
  productExportQuerySchema,
  productListQuerySchema,
  productListResponseSchema,
  productResponseSchema,
  updateProductBodySchema,
} from "./products.schema";

export const productsRouter = Router();

productsRouter.use(authenticate);
// Every signed-in user reads the catalog: a quote line is picked from it.
productsRouter.get("/", listProductsHandler);
// Above /:id, or "export" would be read as an id.
productsRouter.get("/export", exportProductsHandler);
productsRouter.get("/:id", getProductHandler);

// Changing it is for Admins (QUOT-01).
productsRouter.use(requireRole("ADMIN"));
productsRouter.post("/", createProductHandler);
productsRouter.patch("/:id", updateProductHandler);
productsRouter.delete("/:id", deleteProductHandler);
productsRouter.post("/:id/archive", archiveProductHandler);
productsRouter.post("/:id/restore", restoreProductHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Products"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const notAdmin = errorResponse("Not an Admin (FORBIDDEN)");
const notFound = errorResponse("No product has this id (NOT_FOUND)");

registry.registerPath({
  method: "get",
  path: "/products",
  tags,
  summary: "List the products, with search, a filter, sorting and paging",
  description:
    "For every signed-in user. search matches the name and the SKU. By name unless asked otherwise; active=true leaves out the archived products (what a product picker wants), active=false lists only those.",
  security,
  request: { query: productListQuerySchema },
  responses: {
    200: jsonResponse(
      "One page of products; meta.total counts every match",
      productListResponseSchema,
    ),
    400: errorResponse("The request is not acceptable (VALIDATION_FAILED)"),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/products/export",
  tags,
  summary: "Download the products as a CSV file",
  description: `For every signed-in user. ${CSV_EXPORT} An empty Tax rate cell means the organisation's default tax rate applies.`,
  security,
  request: { query: productExportQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: errorResponse("The request is not acceptable (VALIDATION_FAILED)"),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/products/{id}",
  tags,
  summary: "Get one product",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The product", productResponseSchema),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/products",
  tags,
  summary: "Add a product (Admin only)",
  security,
  request: { body: jsonBody(createProductBodySchema) },
  responses: {
    201: jsonResponse("The new product", productResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a SKU another product already has"),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "patch",
  path: "/products/{id}",
  tags,
  summary: "Change a product (Admin only)",
  description:
    "Only the keys sent are changed. Quote lines already made from the product keep their own description, price and tax rate.",
  security,
  request: { params, body: jsonBody(updateProductBodySchema) },
  responses: {
    200: jsonResponse("The changed product", productResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a SKU another product already has"),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/products/{id}/archive",
  tags,
  summary: "Archive a product: no longer offered for new quote lines (Admin only)",
  description: "Quotes that use it are not changed. Archiving it again answers with it unchanged.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The product, with active false", productResponseSchema),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/products/{id}/restore",
  tags,
  summary: "Put an archived product back in use (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The product, with active true", productResponseSchema),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/products/{id}",
  tags,
  summary: "Delete a product that no quote uses (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted", deletedResponseSchema),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
    409: errorResponse("PRODUCT_IN_USE: the product is on a quote; archive it instead"),
  },
});
