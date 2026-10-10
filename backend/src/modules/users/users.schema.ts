import { envelope, z } from "../../lib/openapi";
import { emailSchema, nameSchema, roleSchema } from "../../lib/user-fields";

// Derived, not stored: deactivated wins, then "invited" while no password has been set.
export const userStatusSchema = z.enum(["ACTIVE", "INVITED", "DEACTIVATED"]).openapi("UserStatus");

export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: roleSchema,
    status: userStatusSchema,
    managerId: z.string().nullable(),
    // Carries the status so the screen can warn when a manager has been deactivated.
    manager: z.object({ id: z.string(), name: z.string(), status: userStatusSchema }).nullable(),
    createdAt: z.string(),
  })
  .openapi("User");

// Named ApiUser in code because `User` is the Prisma row.
export type ApiUser = z.infer<typeof userSchema>;

// What happened to an invite or reset link: emailed, or handed back for the Admin to pass on
// (D-10). `link` is set only when the email was not sent.
export const linkResultSchema = z
  .object({ emailed: z.boolean(), link: z.string().nullable() })
  .openapi("LinkResult");

export type LinkResult = z.infer<typeof linkResultSchema>;

// Someone a record can be assigned to: just enough for an owner picker.
export const assignableUserSchema = z
  .object({ id: z.string(), name: z.string(), role: roleSchema })
  .openapi("AssignableUser");

export type AssignableUser = z.infer<typeof assignableUserSchema>;

const managerIdSchema = z.uuid().nullable();

export const createUserBodySchema = z
  .strictObject({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    managerId: managerIdSchema.optional(),
  })
  .openapi("CreateUserBody");

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

// Only the keys that are sent are changed.
export const updateUserBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
    managerId: managerIdSchema.optional(),
  })
  .openapi("UpdateUserBody");

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const userIdParamsSchema = z.object({ id: z.uuid() });

export const userListResponseSchema = z.object({
  data: z.array(userSchema),
  // False when outgoing email is off, so the screen can say that links must be passed on by hand.
  meta: z.object({ mailEnabled: z.boolean() }),
});

export const updateUserResponseSchema = z.object({
  data: userSchema,
  // How many reps lost this user as their manager because the user stopped being a Sales Manager.
  meta: z.object({ reassignedReports: z.number().int() }),
});

export const createUserResponseSchema = envelope(
  z.object({ user: userSchema, invite: linkResultSchema }),
);
export const userResponseSchema = envelope(userSchema);
export const assignableUsersResponseSchema = envelope(z.array(assignableUserSchema));
export const linkResultResponseSchema = envelope(linkResultSchema);
