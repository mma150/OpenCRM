import type { Request, Response } from "express";

import { isMailConfigured } from "../../lib/mailer";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiUser,
  type AssignableUser,
  createUserBodySchema,
  type LinkResult,
  updateUserBodySchema,
  userIdParamsSchema,
} from "./users.schema";
import {
  createPasswordResetLink,
  deactivateUser,
  inviteUser,
  listAssignableUsers,
  listUsers,
  reactivateUser,
  resendInvite,
  updateUser,
} from "./users.service";

export async function listUsersHandler(_req: Request, res: Response) {
  const data: ApiUser[] = await listUsers();
  res.json({ data, meta: { mailEnabled: await isMailConfigured() } });
}

export async function listAssignableUsersHandler(req: Request, res: Response) {
  const data: AssignableUser[] = await listAssignableUsers(getAuth(req).user);
  res.json({ data, meta: {} });
}

export async function createUserHandler(req: Request, res: Response) {
  const input = createUserBodySchema.parse(req.body);
  const data = await inviteUser(input);
  res.status(201).json({ data, meta: {} });
}

export async function updateUserHandler(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  const input = updateUserBodySchema.parse(req.body);
  const { user, reassignedReports } = await updateUser(id, input);
  res.json({ data: user, meta: { reassignedReports } });
}

export async function deactivateUserHandler(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  const data: ApiUser = await deactivateUser(id, getAuth(req).user.id);
  res.json({ data, meta: {} });
}

export async function reactivateUserHandler(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  const data: ApiUser = await reactivateUser(id);
  res.json({ data, meta: {} });
}

export async function resendInviteHandler(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  const data: LinkResult = await resendInvite(id);
  res.json({ data, meta: {} });
}

export async function passwordResetLinkHandler(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  const data: LinkResult = await createPasswordResetLink(id);
  res.json({ data, meta: {} });
}
