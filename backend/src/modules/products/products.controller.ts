import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import {
  type ApiProduct,
  createProductBodySchema,
  productExportQuerySchema,
  productListQuerySchema,
  updateProductBodySchema,
} from "./products.schema";
import {
  createProduct,
  deleteProduct,
  exportProducts,
  getProduct,
  listProducts,
  setProductActive,
  updateProduct,
} from "./products.service";

export async function listProductsHandler(req: Request, res: Response) {
  const query = productListQuerySchema.parse(req.query);
  const { items, total } = await listProducts(query);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportProductsHandler(req: Request, res: Response) {
  const query = productExportQuerySchema.parse(req.query);
  sendCsv(res, "products", query.tz, await exportProducts(query));
}

export async function getProductHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiProduct = await getProduct(id);
  res.json({ data, meta: {} });
}

export async function createProductHandler(req: Request, res: Response) {
  const input = createProductBodySchema.parse(req.body);
  const data: ApiProduct = await createProduct(input);
  res.status(201).json({ data, meta: {} });
}

export async function updateProductHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateProductBodySchema.parse(req.body);
  const data: ApiProduct = await updateProduct(id, input);
  res.json({ data, meta: {} });
}

export async function archiveProductHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiProduct = await setProductActive(id, false);
  res.json({ data, meta: {} });
}

export async function restoreProductHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiProduct = await setProductActive(id, true);
  res.json({ data, meta: {} });
}

export async function deleteProductHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteProduct(id);
  res.json({ data: null, meta: {} });
}
