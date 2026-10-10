import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import { parseCustomFieldFilters } from "../../lib/custom-fields";
import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiContact,
  assignContactBodySchema,
  contactExportQuerySchema,
  contactListQuerySchema,
  createContactBodySchema,
  updateContactBodySchema,
} from "./contacts.schema";
import {
  assignContact,
  createContact,
  deleteContact,
  exportContacts,
  getContact,
  listContacts,
  updateContact,
} from "./contacts.service";

export async function listContactsHandler(req: Request, res: Response) {
  const query = contactListQuerySchema.parse(req.query);
  const filters = parseCustomFieldFilters(req.query);
  const { items, total } = await listContacts(getAuth(req).user, query, filters);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportContactsHandler(req: Request, res: Response) {
  const query = contactExportQuerySchema.parse(req.query);
  const filters = parseCustomFieldFilters(req.query);
  sendCsv(res, "contacts", query.tz, await exportContacts(getAuth(req).user, query, filters));
}

export async function createContactHandler(req: Request, res: Response) {
  const input = createContactBodySchema.parse(req.body);
  const data: ApiContact = await createContact(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}

export async function getContactHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiContact = await getContact(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function updateContactHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateContactBodySchema.parse(req.body);
  const data: ApiContact = await updateContact(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function assignContactHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const { ownerId } = assignContactBodySchema.parse(req.body);
  const data: ApiContact = await assignContact(getAuth(req).user, id, ownerId);
  res.json({ data, meta: {} });
}

export async function deleteContactHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteContact(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}
