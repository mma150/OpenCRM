import { http } from "@/lib/api/http";

import type {
  AssignableUser,
  AssignableUsersResponse,
  InviteUserInput,
  InviteUserResponse,
  InviteUserResult,
  LinkResponse,
  LinkResult,
  UpdateUserInput,
  UpdateUserResponse,
  UpdateUserResult,
  User,
  UserList,
  UserResponse,
  UsersResponse,
} from "./users.types";

// The list comes with `meta.mailEnabled`: whether the server can send email at all.
export async function listUsers(): Promise<UserList> {
  const response = await http.get<UsersResponse>("/users");
  return { users: response.data.data, mailEnabled: response.data.meta.mailEnabled };
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const response = await http.post<InviteUserResponse>("/users", input);
  return response.data.data;
}

// `meta.reassignedReports` counts the reps who lost this user as their manager.
export async function updateUser(id: string, input: UpdateUserInput): Promise<UpdateUserResult> {
  const response = await http.patch<UpdateUserResponse>(`/users/${id}`, input);
  return { user: response.data.data, reassignedReports: response.data.meta.reassignedReports };
}

export async function deactivateUser(id: string): Promise<User> {
  const response = await http.post<UserResponse>(`/users/${id}/deactivate`);
  return response.data.data;
}

export async function reactivateUser(id: string): Promise<User> {
  const response = await http.post<UserResponse>(`/users/${id}/reactivate`);
  return response.data.data;
}

export async function resendInvite(id: string): Promise<LinkResult> {
  const response = await http.post<LinkResponse>(`/users/${id}/resend-invite`);
  return response.data.data;
}

export async function createPasswordResetLink(id: string): Promise<LinkResult> {
  const response = await http.post<LinkResponse>(`/users/${id}/password-reset-link`);
  return response.data.data;
}

// Who the signed-in user may assign records to: everyone for an Admin, the team for a
// Sales Manager, only themselves for a Sales Rep, nobody for Read-only.
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const response = await http.get<AssignableUsersResponse>("/users/assignable");
  return response.data.data;
}
