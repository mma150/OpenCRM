import { envelope, z } from "../../lib/openapi";
import { PASSWORD_MAX_LENGTH } from "../../lib/password";
import {
  emailSchema,
  linkTokenSchema,
  nameSchema,
  passwordSchema,
  roleSchema,
} from "../../lib/user-fields";

// Every body is strict: an unknown key is VALIDATION_FAILED, so a request can never
// set a field (such as role) that the route does not offer.

export const setupBodySchema = z
  .strictObject({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .openapi("SetupBody");

// The password rule is not applied at login: an account's password is whatever was accepted
// when it was set. The cap only keeps a huge value away from the hash function.
export const loginBodySchema = z
  .strictObject({ email: emailSchema, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .openapi("LoginBody");

export const forgotPasswordBodySchema = z
  .strictObject({ email: emailSchema })
  .openapi("ForgotPasswordBody");

export const resetPasswordBodySchema = z
  .strictObject({ token: linkTokenSchema, password: passwordSchema })
  .openapi("ResetPasswordBody");

export const inviteInfoBodySchema = z
  .strictObject({ token: linkTokenSchema })
  .openapi("InviteInfoBody");

export const acceptInviteBodySchema = z
  .strictObject({ token: linkTokenSchema, password: passwordSchema })
  .openapi("AcceptInviteBody");

// A user changes only their own name here; email, role and manager belong to Admins (D-20).
export const updateProfileBodySchema = z
  .strictObject({ name: nameSchema })
  .openapi("UpdateProfileBody");

export const changePasswordBodySchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .openapi("ChangePasswordBody");

export const meSchema = z
  .object({ id: z.string(), name: z.string(), email: z.string(), role: roleSchema })
  .openapi("Me");

export type Me = z.infer<typeof meSchema>;

export const setupStatusSchema = z.object({ setupRequired: z.boolean() }).openapi("SetupStatus");

export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const inviteInfoSchema = z
  .object({ name: z.string(), email: z.string(), role: roleSchema })
  .openapi("InviteInfo");

export type InviteInfo = z.infer<typeof inviteInfoSchema>;

export const meResponseSchema = envelope(meSchema);
export const setupStatusResponseSchema = envelope(setupStatusSchema);
export const inviteInfoResponseSchema = envelope(inviteInfoSchema);
// Routes that only do something answer with `data: null`.
export const emptyResponseSchema = envelope(z.null());
