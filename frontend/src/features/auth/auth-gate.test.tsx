import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore } from "@/test/render-with-store";

import { getMe } from "./auth.api";
import { sessionExpired } from "./auth.slice";
import type { Me } from "./auth.types";
import { AuthGate } from "./auth-gate";

vi.mock("./auth.api");

const unauthenticated: ApiError = {
  code: "UNAUTHENTICATED",
  message: "Sign in to continue",
  details: null,
};

function renderGate() {
  return renderWithStore(
    <AuthGate>
      <p>Private page</p>
    </AuthGate>,
  );
}

describe("AuthGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading, then the page once the user is known", async () => {
    let resolve: (me: Me) => void = () => undefined;
    vi.mocked(getMe).mockReturnValue(
      new Promise<Me>((done) => {
        resolve = done;
      }),
    );

    renderGate();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Private page")).not.toBeInTheDocument();

    resolve(adminUser);

    expect(await screen.findByText("Private page")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to /login and remembers where they were going", async () => {
    setMockLocation("/settings/users");
    vi.mocked(getMe).mockRejectedValue(unauthenticated);

    renderGate();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/login?next=%2Fsettings%2Fusers");
    });
    expect(screen.queryByText("Private page")).not.toBeInTheDocument();
  });

  it("adds no next when the visitor was going to Home", async () => {
    vi.mocked(getMe).mockRejectedValue(unauthenticated);

    renderGate();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("does not redirect on a network failure: it offers Retry", async () => {
    vi.mocked(getMe)
      .mockRejectedValueOnce({
        code: "NETWORK_ERROR",
        message: "Could not reach the server",
        details: null,
      })
      .mockResolvedValueOnce(adminUser);

    const { user } = renderGate();

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Private page")).toBeInTheDocument();
  });

  it("leaves the page for /login when the session expires later", async () => {
    setMockLocation("/profile");
    vi.mocked(getMe).mockResolvedValue(adminUser);
    const { store } = renderGate();
    await screen.findByText("Private page");

    store.dispatch(sessionExpired());

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/login?next=%2Fprofile");
    });
    expect(screen.queryByText("Private page")).not.toBeInTheDocument();
  });
});
