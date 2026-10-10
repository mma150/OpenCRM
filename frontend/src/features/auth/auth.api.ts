import { http } from "@/lib/api/http";

import type {
  ChangePasswordInput,
  InviteInfo,
  InviteInfoResponse,
  LoginInput,
  Me,
  MeResponse,
  SetupInput,
  SetupStatus,
  SetupStatusResponse,
  TokenPasswordInput,
  UpdateProfileInput,
} from "./auth.types";

// Every function returns the unwrapped `data` of the { data, meta } envelope.
// Signing in, setup, accepting an invite and the profile calls all answer with the user (Me).

export async function getSetupStatus(): Promise<SetupStatus> {
  const response = await http.get<SetupStatusResponse>("/auth/setup-status");
  return response.data.data;
}

export async function setupAdmin(input: SetupInput): Promise<Me> {
  const response = await http.post<MeResponse>("/auth/setup", input);
  return response.data.data;
}

export async function login(input: LoginInput): Promise<Me> {
  const response = await http.post<MeResponse>("/auth/login", input);
  return response.data.data;
}

export async function logout(): Promise<void> {
  await http.post("/auth/logout");
}

export async function getMe(): Promise<Me> {
  const response = await http.get<MeResponse>("/auth/me");
  return response.data.data;
}

export async function updateMe(input: UpdateProfileInput): Promise<Me> {
  const response = await http.patch<MeResponse>("/auth/me", input);
  return response.data.data;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await http.post("/auth/change-password", input);
}

export async function forgotPassword(email: string): Promise<void> {
  await http.post("/auth/forgot-password", { email });
}

export async function resetPassword(input: TokenPasswordInput): Promise<void> {
  await http.post("/auth/reset-password", input);
}

export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const response = await http.post<InviteInfoResponse>("/auth/invite-info", { token });
  return response.data.data;
}

export async function acceptInvite(input: TokenPasswordInput): Promise<Me> {
  const response = await http.post<MeResponse>("/auth/accept-invite", input);
  return response.data.data;
}
