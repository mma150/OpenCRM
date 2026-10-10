import type { Request, Response } from "express";

import { clearSessionCookie, setSessionCookie } from "../../lib/session-cookie";
import { getAuth } from "../../middleware/authenticate";
import {
  acceptInviteBodySchema,
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  type InviteInfo,
  inviteInfoBodySchema,
  loginBodySchema,
  type Me,
  resetPasswordBodySchema,
  setupBodySchema,
  type SetupStatus,
  updateProfileBodySchema,
} from "./auth.schema";
import {
  acceptInvite,
  changePassword,
  getInviteInfo,
  getSetupStatus,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  setupAdmin,
  toMe,
  updateProfile,
} from "./auth.service";

export async function getSetupStatusHandler(_req: Request, res: Response) {
  const data: SetupStatus = await getSetupStatus();
  res.json({ data, meta: {} });
}

export async function setupHandler(req: Request, res: Response) {
  const input = setupBodySchema.parse(req.body);
  const { user, token } = await setupAdmin(input);
  setSessionCookie(res, token);
  res.status(201).json({ data: user, meta: {} });
}

export async function loginHandler(req: Request, res: Response) {
  const input = loginBodySchema.parse(req.body);
  const { user, token } = await login(input.email, input.password);
  // The token travels only in the httpOnly cookie, never in the body.
  setSessionCookie(res, token);
  res.json({ data: user, meta: {} });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const input = forgotPasswordBodySchema.parse(req.body);
  await requestPasswordReset(input.email);
  // The same answer whether or not the email has an account (D-08).
  res.json({ data: null, meta: {} });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const input = resetPasswordBodySchema.parse(req.body);
  await resetPassword(input.token, input.password);
  res.json({ data: null, meta: {} });
}

export async function inviteInfoHandler(req: Request, res: Response) {
  const input = inviteInfoBodySchema.parse(req.body);
  const data: InviteInfo = await getInviteInfo(input.token);
  res.json({ data, meta: {} });
}

export async function acceptInviteHandler(req: Request, res: Response) {
  const input = acceptInviteBodySchema.parse(req.body);
  const { user, token } = await acceptInvite(input.token, input.password);
  setSessionCookie(res, token);
  res.json({ data: user, meta: {} });
}

export function getMeHandler(req: Request, res: Response) {
  const data: Me = toMe(getAuth(req).user);
  res.json({ data, meta: {} });
}

export async function updateMeHandler(req: Request, res: Response) {
  const input = updateProfileBodySchema.parse(req.body);
  const data: Me = await updateProfile(getAuth(req).user.id, input.name);
  res.json({ data, meta: {} });
}

export async function changePasswordHandler(req: Request, res: Response) {
  const input = changePasswordBodySchema.parse(req.body);
  const { user, sessionId } = getAuth(req);
  await changePassword(user.id, sessionId, input.currentPassword, input.newPassword);
  res.json({ data: null, meta: {} });
}

export async function logoutHandler(req: Request, res: Response) {
  await logout(getAuth(req).sessionId);
  clearSessionCookie(res);
  res.json({ data: null, meta: {} });
}
