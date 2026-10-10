import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithStore, repUser } from "@/test/render-with-store";

import { changePassword, updateMe } from "./auth.api";
import { ProfilePage } from "./profile-page";

vi.mock("./auth.api");

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the name to edit, the email read-only and the role", () => {
    renderWithStore(<ProfilePage />, { me: repUser });

    expect(screen.getByLabelText("Name")).toHaveValue("Rob Rep");
    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("rob@example.com");
    expect(email).toBeDisabled();
    expect(email).toHaveAccessibleDescription("Only an Admin can change your email.");
    expect(screen.getByText("Sales Rep")).toBeInTheDocument();
  });

  it("saves a new name into the store", async () => {
    vi.mocked(updateMe).mockResolvedValue({ ...repUser, name: "Robert Rep" });
    const { user, store } = renderWithStore(<ProfilePage />, { me: repUser });

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Robert Rep");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(store.getState().auth.data?.name).toBe("Robert Rep");
    });
    expect(updateMe).toHaveBeenCalledWith({ name: "Robert Rep" });
  });

  it("puts a wrong current password on its field and keeps the user signed in", async () => {
    vi.mocked(changePassword).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [{ path: "currentPassword", message: "Current password is incorrect." }],
    });
    const { user, store } = renderWithStore(<ProfilePage />, { me: repUser });

    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(store.getState().auth.data).toEqual(repUser);
  });

  it("changes the password and clears the form", async () => {
    vi.mocked(changePassword).mockResolvedValue();
    const { user } = renderWithStore(<ProfilePage />, { me: repUser });

    await user.type(screen.getByLabelText("Current password"), "old-password-1");
    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Current password")).toHaveValue("");
    });
    // Only the two fields the API takes are sent, not the confirmation.
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password-1",
      newPassword: "a-new-password",
    });
  });
});
