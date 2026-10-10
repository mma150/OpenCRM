import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore } from "@/test/render-with-store";

import { getMe, getSetupStatus, login } from "./auth.api";
import { GuestGate } from "./guest-gate";
import { LoginForm } from "./login-form";

vi.mock("./auth.api");

const unauthenticated: ApiError = {
  code: "UNAUTHENTICATED",
  message: "Sign in to continue",
  details: null,
};

// The login page as the route renders it: the form inside GuestGate.
function renderLogin() {
  return renderWithStore(
    <GuestGate>
      <LoginForm />
    </GuestGate>,
  );
}

async function signIn(user: ReturnType<typeof renderLogin>["user"]) {
  await user.type(await screen.findByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "a-long-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // By default: nobody is signed in and the first Admin already exists.
    vi.mocked(getMe).mockRejectedValue(unauthenticated);
    vi.mocked(getSetupStatus).mockResolvedValue({ setupRequired: false });
  });

  it("signs in and goes Home", async () => {
    vi.mocked(login).mockResolvedValue(adminUser);
    const { user, store } = renderLogin();

    await signIn(user);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
    expect(login).toHaveBeenCalledWith({ email: "ada@example.com", password: "a-long-password" });
    expect(store.getState().auth.data).toEqual(adminUser);
  });

  it("goes to a safe ?next= after signing in", async () => {
    setMockLocation("/login", "next=%2Fsettings%2Fusers");
    vi.mocked(login).mockResolvedValue(adminUser);
    const { user } = renderLogin();

    await signIn(user);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/settings/users");
    });
  });

  it.each(["//evil.example", "https://evil.example/login"])(
    "ignores ?next=%s and goes Home",
    async (next) => {
      setMockLocation("/login", `next=${encodeURIComponent(next)}`);
      vi.mocked(login).mockResolvedValue(adminUser);
      const { user } = renderLogin();

      await signIn(user);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith("/");
      });
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    },
  );

  it("sends a user who is already signed in away without showing the form", async () => {
    vi.mocked(getMe).mockResolvedValue(adminUser);

    renderLogin();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("goes to /setup while the first Admin does not exist", async () => {
    vi.mocked(getSetupStatus).mockResolvedValue({ setupRequired: true });

    renderLogin();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/setup");
    });
  });

  it.each([
    [
      { code: "INVALID_CREDENTIALS", message: "Server text", details: null },
      "Email or password is incorrect.",
    ],
    [
      { code: "ACCOUNT_LOCKED", message: "Server text", details: { retryAfterSeconds: 900 } },
      "This account is locked after too many wrong passwords. Try again in 15 minutes.",
    ],
    [
      { code: "RATE_LIMITED", message: "Server text", details: { retryAfterSeconds: 120 } },
      "Too many attempts. Try again in 2 minutes.",
    ],
    [
      { code: "ACCOUNT_DEACTIVATED", message: "Server text", details: null },
      "This account has been deactivated. Ask an Admin to reactivate it.",
    ],
    [
      { code: "NETWORK_ERROR", message: "Server text", details: null },
      "The server cannot be reached. Check your connection and try again.",
    ],
  ] satisfies [ApiError, string][])(
    "explains $0.code and stays on the page",
    async (error, text) => {
      vi.mocked(login).mockRejectedValue(error);
      const { user, store } = renderLogin();

      await signIn(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      // The server's own text is never shown for a known code (D-12).
      expect(screen.getByRole("alert")).not.toHaveTextContent("Server text");
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(store.getState().auth.data).toBeNull();
      // The form is still there with what was typed.
      expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    },
  );

  it("checks the fields before calling the API", async () => {
    const { user } = renderLogin();

    await user.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("links to the forgot password page", async () => {
    renderLogin();

    expect(await screen.findByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
