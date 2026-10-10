import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { renderWithStore, repUser } from "@/test/render-with-store";

import { AcceptInviteForm } from "./accept-invite-form";
import {
  acceptInvite,
  forgotPassword,
  getInviteInfo,
  getSetupStatus,
  resetPassword,
  setupAdmin,
} from "./auth.api";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SetupForm } from "./setup-form";

vi.mock("./auth.api");

const invalidToken: ApiError = { code: "INVALID_TOKEN", message: "Server text", details: null };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("always answers with the same generic message (D-08)", async () => {
    vi.mocked(forgotPassword).mockResolvedValue();
    const { user } = renderWithStore(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If that email exists, we sent a link.",
    );
    expect(forgotPassword).toHaveBeenCalledWith("nobody@example.com");
  });

  it("explains a rate limit", async () => {
    vi.mocked(forgotPassword).mockRejectedValue({
      code: "RATE_LIMITED",
      message: "Server text",
      details: { retryAfterSeconds: 300 },
    });
    const { user } = renderWithStore(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again in 5 minutes.",
    );
  });
});

describe("ResetPasswordForm", () => {
  async function fillAndSubmit(user: ReturnType<typeof renderWithStore>["user"], confirm: string) {
    await user.type(screen.getByLabelText("New password"), "a-long-password");
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
    await user.click(screen.getByRole("button", { name: "Set new password" }));
  }

  it("sets the password with the token from the link, then points to sign in", async () => {
    setMockLocation("/reset-password", "token=reset-token");
    vi.mocked(resetPassword).mockResolvedValue();
    const { user } = renderWithStore(<ResetPasswordForm />);

    await fillAndSubmit(user, "a-long-password");

    expect(await screen.findByRole("status")).toHaveTextContent("Your password has been changed.");
    expect(resetPassword).toHaveBeenCalledWith({
      token: "reset-token",
      password: "a-long-password",
    });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("refuses two different passwords without calling the API", async () => {
    setMockLocation("/reset-password", "token=reset-token");
    const { user } = renderWithStore(<ResetPasswordForm />);

    await fillAndSubmit(user, "another-password");

    expect(await screen.findByText("The two passwords do not match.")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's reason on the password field (a too common password)", async () => {
    setMockLocation("/reset-password", "token=reset-token");
    vi.mocked(resetPassword).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [{ path: "password", message: "That password is too common." }],
    });
    const { user } = renderWithStore(<ResetPasswordForm />);

    await fillAndSubmit(user, "a-long-password");

    expect(await screen.findByText("That password is too common.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
  });

  it("says the link is invalid or expired when the server rejects the token", async () => {
    setMockLocation("/reset-password", "token=used-token");
    vi.mocked(resetPassword).mockRejectedValue(invalidToken);
    const { user } = renderWithStore(<ResetPasswordForm />);

    await fillAndSubmit(user, "a-long-password");

    expect(
      await screen.findByRole("heading", { name: "This link is invalid or has expired" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("says the link is invalid when it carries no token", () => {
    setMockLocation("/reset-password");
    renderWithStore(<ResetPasswordForm />);

    expect(
      screen.getByRole("heading", { name: "This link is invalid or has expired" }),
    ).toBeInTheDocument();
  });
});

describe("AcceptInviteForm", () => {
  const invite = { name: "Rob Rep", email: "rob@example.com", role: "SALES_REP" } as const;

  it("greets the invited person by name and role, then signs them in", async () => {
    setMockLocation("/accept-invite", "token=invite-token");
    vi.mocked(getInviteInfo).mockResolvedValue(invite);
    vi.mocked(acceptInvite).mockResolvedValue(repUser);
    const { user, store } = renderWithStore(<AcceptInviteForm />);

    expect(await screen.findByRole("heading", { name: "Welcome, Rob Rep" })).toBeInTheDocument();
    expect(screen.getByText("Sales Rep")).toBeInTheDocument();
    expect(screen.getByText("rob@example.com")).toBeInTheDocument();
    expect(getInviteInfo).toHaveBeenCalledWith("invite-token");

    await user.type(screen.getByLabelText("New password"), "a-long-password");
    await user.type(screen.getByLabelText("Confirm new password"), "a-long-password");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));

    await waitFor(() => {
      expect(store.getState().auth.data).toEqual(repUser);
    });
    expect(acceptInvite).toHaveBeenCalledWith({
      token: "invite-token",
      password: "a-long-password",
    });
  });

  it("shows a clear state when the link is invalid or has expired", async () => {
    setMockLocation("/accept-invite", "token=old-token");
    vi.mocked(getInviteInfo).mockRejectedValue(invalidToken);
    renderWithStore(<AcceptInviteForm />);

    expect(
      await screen.findByRole("heading", { name: "This link is invalid or has expired" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Ask your Admin to send you a new invite.");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("shows the same state without a token, and does not call the API", () => {
    setMockLocation("/accept-invite");
    renderWithStore(<AcceptInviteForm />);

    expect(
      screen.getByRole("heading", { name: "This link is invalid or has expired" }),
    ).toBeInTheDocument();
    expect(getInviteInfo).not.toHaveBeenCalled();
  });

  it("offers Retry when the invite could not be checked", async () => {
    setMockLocation("/accept-invite", "token=invite-token");
    vi.mocked(getInviteInfo)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(invite);
    const { user } = renderWithStore(<AcceptInviteForm />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Rob Rep" })).toBeInTheDocument();
  });
});

describe("SetupForm", () => {
  it("creates the first Admin, who is then signed in", async () => {
    vi.mocked(getSetupStatus).mockResolvedValue({ setupRequired: true });
    vi.mocked(setupAdmin).mockResolvedValue({ ...repUser, role: "ADMIN" });
    const { user, store } = renderWithStore(<SetupForm />);

    await user.type(await screen.findByLabelText("Full name"), "Rob Rep");
    await user.type(screen.getByLabelText("Email"), "rob@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-password");
    await user.click(screen.getByRole("button", { name: "Create Admin account" }));

    await waitFor(() => {
      expect(store.getState().auth.data?.role).toBe("ADMIN");
    });
    expect(setupAdmin).toHaveBeenCalledWith({
      name: "Rob Rep",
      email: "rob@example.com",
      password: "a-long-password",
    });
  });

  it("requires at least 10 characters before calling the API", async () => {
    vi.mocked(getSetupStatus).mockResolvedValue({ setupRequired: true });
    const { user } = renderWithStore(<SetupForm />);

    await user.type(await screen.findByLabelText("Full name"), "Rob Rep");
    await user.type(screen.getByLabelText("Email"), "rob@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create Admin account" }));

    expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(setupAdmin).not.toHaveBeenCalled();
  });

  it("goes to /login once setup is closed", async () => {
    vi.mocked(getSetupStatus).mockResolvedValue({ setupRequired: false });
    renderWithStore(<SetupForm />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });
});
