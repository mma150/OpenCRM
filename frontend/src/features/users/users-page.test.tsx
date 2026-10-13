import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEmailStatus } from "@/features/email-settings/email-settings.api";
import type { ApiError } from "@/lib/api/http";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { deactivateUser, inviteUser, listUsers, resendInvite, updateUser } from "./users.api";
import { admin, allUsers, invited, manager, rep } from "./users.fixtures";
import type { User } from "./users.types";
import { UsersPage } from "./users-page";

vi.mock("./users.api");
// The "outgoing email is off" note asks GET /settings/email/status.
vi.mock("@/features/email-settings/email-settings.api");

type TestUser = ReturnType<typeof renderWithStore>["user"];

// The page renders the table and the phone cards together (CSS shows one), so the tests
// look inside the table.
async function renderUsers(users: User[] = allUsers, mailEnabled = true) {
  vi.mocked(listUsers).mockResolvedValue({ users, mailEnabled });
  vi.mocked(getEmailStatus).mockResolvedValue({ enabled: mailEnabled });
  const view = renderWithStore(<UsersPage />, { me: adminUser });
  const table = await screen.findByRole("table", { name: "Users" });
  return { ...view, table };
}

async function openActions(user: TestUser, table: HTMLElement, name: string) {
  await user.click(within(table).getByRole("button", { name: `Actions for ${name}` }));
  return screen.findByRole("menu");
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("tells a non-admin they have no access and does not ask the API", () => {
    renderWithStore(<UsersPage />, { me: repUser });

    expect(screen.getByText("You do not have access to Users")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Invite user" })).not.toBeInTheDocument();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("lists every user with role, manager and status", async () => {
    const { table } = await renderUsers();

    const row = within(table).getByRole("row", { name: /Rob Rep/ });
    expect(within(row).getByText("rob@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Sales Rep")).toBeInTheDocument();
    expect(within(row).getByText("Mia Manager")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Ada Admin\s*\(you\)/ })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(allUsers.length + 1);
  });

  it("dims deactivated users", async () => {
    const { table } = await renderUsers();

    expect(within(table).getByText("Dan Deactivated").closest("td")).toHaveClass("opacity-60");
    expect(within(table).getByText("Rob Rep").closest("td")).not.toHaveClass("opacity-60");
  });

  it("flags a rep whose manager was deactivated", async () => {
    const orphan: User = {
      ...rep,
      manager: { id: manager.id, name: manager.name, status: "DEACTIVATED" },
    };
    const { table } = await renderUsers([admin, orphan]);

    expect(within(table).getByText("Manager deactivated")).toBeInTheDocument();
  });

  it("shows the banner only when outgoing email is off", async () => {
    const banner = "Outgoing email is off. Invite links will be shown for you to copy.";

    const first = await renderUsers(allUsers, false);
    expect(await screen.findByText(banner, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up email" })).toHaveAttribute(
      "href",
      "/settings/email",
    );
    first.unmount();

    await renderUsers(allUsers, true);
    await waitFor(() => {
      expect(getEmailStatus).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText(banner, { exact: false })).not.toBeInTheDocument();
  });

  it("takes the banner from the email status, not from the users list", async () => {
    // The list still says email is on; the status is what counts.
    vi.mocked(listUsers).mockResolvedValue({ users: allUsers, mailEnabled: true });
    vi.mocked(getEmailStatus).mockResolvedValue({ enabled: false });
    renderWithStore(<UsersPage />, { me: adminUser });

    expect(await screen.findByText(/Outgoing email is off/)).toBeInTheDocument();
  });

  it("does not claim email is off while the status is unknown", async () => {
    vi.mocked(listUsers).mockResolvedValue({ users: allUsers, mailEnabled: false });
    vi.mocked(getEmailStatus).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Server text",
      details: null,
    });
    renderWithStore(<UsersPage />, { me: adminUser });

    await screen.findByRole("table", { name: "Users" });
    await waitFor(() => {
      expect(getEmailStatus).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Outgoing email is off/)).not.toBeInTheDocument();
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(listUsers)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce({ users: allUsers, mailEnabled: true });
    const { user } = renderWithStore(<UsersPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table", { name: "Users" })).toBeInTheDocument();
  });

  it("offers each user only the actions that apply to them", async () => {
    const { user, table } = await renderUsers();
    const items = (menu: HTMLElement) =>
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent);

    expect(items(await openActions(user, table, "Ina Invited"))).toEqual([
      "Edit",
      "Resend invite",
      "Deactivate",
    ]);
    await user.keyboard("{Escape}");

    expect(items(await openActions(user, table, "Rob Rep"))).toEqual([
      "Edit",
      "Generate reset link",
      "Deactivate",
    ]);
    await user.keyboard("{Escape}");

    expect(items(await openActions(user, table, "Dan Deactivated"))).toEqual([
      "Edit",
      "Reactivate",
    ]);
    await user.keyboard("{Escape}");

    // Nobody deactivates themselves.
    expect(items(await openActions(user, table, "Ada Admin"))).toEqual([
      "Edit",
      "Generate reset link",
    ]);
  });

  it("invites a user and shows the link to copy when it was not emailed", async () => {
    const link = "http://localhost:3000/accept-invite?token=abc";
    vi.mocked(inviteUser).mockResolvedValue({ user: invited, invite: { emailed: false, link } });
    const { user } = await renderUsers(allUsers, false);

    await user.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog");
    // Sales Rep is preselected, so the Manager field is there.
    expect(within(dialog).getByLabelText("Manager")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Full name"), "Ina Invited");
    await user.type(within(dialog).getByLabelText("Email"), "ina@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));

    expect(await within(dialog).findByRole("textbox", { name: "Invite link" })).toHaveValue(link);
    expect(within(dialog).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(inviteUser).toHaveBeenCalledWith({
      name: "Ina Invited",
      email: "ina@example.com",
      role: "SALES_REP",
    });
  });

  it("says the invite was emailed, with no link, when email works", async () => {
    vi.mocked(inviteUser).mockResolvedValue({
      user: invited,
      invite: { emailed: true, link: null },
    });
    const { user } = await renderUsers();

    await user.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full name"), "Ina Invited");
    await user.type(within(dialog).getByLabelText("Email"), "ina@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));

    expect(
      await within(dialog).findByText(/We emailed an invite link to ina@example.com/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "Invite link" })).not.toBeInTheDocument();
  });

  it("explains EMAIL_IN_USE in the invite dialog and keeps it open", async () => {
    const emailInUse: ApiError = { code: "EMAIL_IN_USE", message: "Server text", details: null };
    vi.mocked(inviteUser).mockRejectedValue(emailInUse);
    const { user } = await renderUsers();

    await user.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full name"), "Rob Again");
    await user.type(within(dialog).getByLabelText("Email"), "rob@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Another user already has this email address.",
    );
    expect(within(dialog).getByLabelText("Email")).toHaveValue("rob@example.com");
  });

  it("edits a user and sends only what changed", async () => {
    vi.mocked(updateUser).mockResolvedValue({
      user: { ...rep, name: "Robert Rep" },
      reassignedReports: 0,
    });
    const { user, table } = await renderUsers();

    const menu = await openActions(user, table, "Rob Rep");
    await user.click(within(menu).getByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Full name"));
    await user.type(within(dialog).getByLabelText("Full name"), "Robert Rep");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(rep.id, { name: "Robert Rep" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("asks before deactivating, then deactivates", async () => {
    vi.mocked(deactivateUser).mockResolvedValue({ ...rep, status: "DEACTIVATED" });
    const { user, table } = await renderUsers();

    const menu = await openActions(user, table, "Rob Rep");
    await user.click(within(menu).getByRole("menuitem", { name: "Deactivate" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Rob Rep?" });
    expect(deactivateUser).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(deactivateUser).toHaveBeenCalledWith(rep.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const { user, table } = await renderUsers();

    const menu = await openActions(user, table, "Rob Rep");
    await user.click(within(menu).getByRole("menuitem", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(deactivateUser).not.toHaveBeenCalled();
  });

  it("explains LAST_ADMIN in the confirmation and keeps it open", async () => {
    const lastAdmin: ApiError = { code: "LAST_ADMIN", message: "Server text", details: null };
    vi.mocked(deactivateUser).mockRejectedValue(lastAdmin);
    const otherAdmin: User = { ...manager, role: "ADMIN" };
    const { user, table } = await renderUsers([admin, otherAdmin]);

    const menu = await openActions(user, table, "Mia Manager");
    await user.click(within(menu).getByRole("menuitem", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This is the last active Admin. Make someone else an Admin first.",
    );
  });

  it("shows the new invite link to copy after Resend invite when email is off", async () => {
    const link = "http://localhost:3000/accept-invite?token=new";
    vi.mocked(resendInvite).mockResolvedValue({ emailed: false, link });
    const { user, table } = await renderUsers(allUsers, false);

    const menu = await openActions(user, table, "Ina Invited");
    await user.click(within(menu).getByRole("menuitem", { name: "Resend invite" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Resend invite" }));

    expect(await screen.findByRole("textbox", { name: "New invite link" })).toHaveValue(link);
    expect(resendInvite).toHaveBeenCalledWith(invited.id);
  });
});
