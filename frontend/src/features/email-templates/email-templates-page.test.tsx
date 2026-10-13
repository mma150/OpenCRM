import { act, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import type { ApiError } from "@/lib/api/http";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  listEmailPlaceholders,
  listEmailTemplates,
  updateEmailTemplate,
} from "./email-templates.api";
import {
  adminTemplates,
  checkIn,
  followUp,
  placeholders,
  templates,
  thanks,
} from "./email-templates.fixtures";
import type { EmailTemplate } from "./email-templates.types";
import { EmailTemplatesPage } from "./email-templates-page";

vi.mock("./email-templates.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

async function renderPage(me: Me = repUser, list: EmailTemplate[] = templates) {
  vi.mocked(listEmailTemplates).mockResolvedValue(list);
  vi.mocked(listEmailPlaceholders).mockResolvedValue(placeholders);
  const view = renderWithStore(<EmailTemplatesPage />, { me });
  await screen.findByRole("button", { name: "New template" });
  await waitFor(() => {
    expect(screen.queryByText("Loading templates...")).not.toBeInTheDocument();
  });
  return view;
}

const rows = () =>
  within(screen.getByRole("list", { name: "Email templates" })).getAllByRole("listitem");
const row = (name: string) => {
  const found = rows().find((item) => within(item).queryByText(name));
  if (!found) {
    throw new Error(`No template called ${name}`);
  }
  return found;
};

async function openNew(user: TestUser) {
  await user.click(screen.getByRole("button", { name: "New template" }));
  return screen.findByRole("dialog", { name: "New template" });
}

async function fillTemplate(user: TestUser, name: string, subject: string, body: string) {
  await user.type(screen.getByLabelText("Name"), name);
  await user.type(screen.getByLabelText("Subject"), subject);
  await user.type(screen.getByLabelText("Message"), body);
}

// Puts the cursor (or a selection) in a text box, as a click or the arrow keys would.
function select(box: HTMLInputElement | HTMLTextAreaElement, start: number, end = start) {
  act(() => {
    box.focus();
    box.setSelectionRange(start, end);
  });
}

async function insertPlaceholder(user: TestUser, label: string) {
  await user.click(screen.getByRole("button", { name: "Insert placeholder" }));
  await user.click(await screen.findByRole("menuitem", { name: new RegExp(label) }));
}

// The dialog tests click through many controls: slow on a busy machine.
describe("EmailTemplatesPage", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("tells a Read-only user they have no access, and does not ask the API", () => {
    renderWithStore(<EmailTemplatesPage />, { me: readOnlyUser });

    expect(screen.getByText("You do not have access to Email templates")).toBeInTheDocument();
    expect(listEmailTemplates).not.toHaveBeenCalled();
  });

  it("shows a loading state, then the templates with subject and text", async () => {
    vi.mocked(listEmailTemplates).mockResolvedValue(templates);
    renderWithStore(<EmailTemplatesPage />, { me: repUser });

    expect(screen.getByText("Loading templates...")).toBeInTheDocument();
    await screen.findByRole("list", { name: "Email templates" });

    expect(rows()).toHaveLength(3);
    const first = within(row("Checking in"));
    expect(first.getByText("Any questions, {{contact.firstName}}?")).toBeInTheDocument();
    expect(first.getByText(/Did you get a chance to look at our proposal/)).toBeInTheDocument();
  });

  it("marks who sees a template, and names the owner of someone else's", async () => {
    await renderPage();

    const mine = within(row("Checking in"));
    expect(mine.getByText("Only you")).toBeInTheDocument();
    expect(mine.queryByText("Shared")).not.toBeInTheDocument();
    expect(mine.queryByText(/^By /)).not.toBeInTheDocument();

    const shared = within(row("Follow-up after demo"));
    expect(shared.getByText("Shared")).toBeInTheDocument();
    expect(shared.getByText(`By ${managerUser.name}`)).toBeInTheDocument();
  });

  it("offers Edit and Delete only for a template the user may change", async () => {
    await renderPage();

    const mine = within(row("Checking in"));
    expect(mine.getByRole("button", { name: "Edit Checking in" })).toBeInTheDocument();
    expect(mine.getByRole("button", { name: "Delete Checking in" })).toBeInTheDocument();

    const shared = within(row("Follow-up after demo"));
    expect(shared.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
    expect(shared.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(shared.getByRole("button", { name: "View Follow-up after demo" })).toBeInTheDocument();
  });

  it("shows a shared template the user may not change, with nothing to edit", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "View Follow-up after demo" }));

    const dialog = within(await screen.findByRole("dialog", { name: "Follow-up after demo" }));
    expect(dialog.getByText(new RegExp(`Shared by ${managerUser.name}`))).toBeInTheDocument();
    expect(dialog.getByText(followUp.subject)).toBeInTheDocument();
    expect(dialog.getByText(/Thank you for your time today/)).toBeInTheDocument();
    expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });

  it("says so when there are no templates", async () => {
    await renderPage(repUser, []);

    expect(screen.getByText("No templates yet")).toBeInTheDocument();
  });

  it("shows the error with Retry when the list cannot be loaded", async () => {
    vi.mocked(listEmailTemplates).mockRejectedValueOnce({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    });
    const { user } = renderWithStore(<EmailTemplatesPage />, { me: repUser });
    expect(await screen.findByText(/The server cannot be reached/)).toBeInTheDocument();

    vi.mocked(listEmailTemplates).mockResolvedValue(templates);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list", { name: "Email templates" })).toBeInTheDocument();
  });

  it.each([
    ["an Admin", adminUser, true],
    ["a Sales Manager", managerUser, true],
    ["a Sales Rep", repUser, false],
  ])("offers 'Shared with everyone' to %s: %s", async (_who, me, offered) => {
    const { user } = await renderPage(me);
    await openNew(user);

    const box = screen.queryByRole("checkbox", { name: /Shared with everyone/ });
    expect(box !== null).toBe(offered);
  });

  it("adds a template; a Sales Rep never sends `shared`", async () => {
    const { user } = await renderPage();
    const created = { ...checkIn, id: "new", name: "Intro", subject: "Hello", body: "Hi there" };
    vi.mocked(createEmailTemplate).mockResolvedValue(created);
    // The list is asked for again after a save.
    vi.mocked(listEmailTemplates).mockResolvedValue([checkIn, followUp, created, thanks]);
    await openNew(user);
    await fillTemplate(user, "Intro", "Hello", "Hi there");
    await user.click(screen.getByRole("button", { name: "Add template" }));

    await waitFor(() => {
      expect(createEmailTemplate).toHaveBeenCalledWith({
        name: "Intro",
        subject: "Hello",
        body: "Hi there",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Template added.");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(within(row("Intro")).getByText("Hello")).toBeInTheDocument();
  });

  it("sends `shared` as ticked for a user who may share", async () => {
    const { user } = await renderPage(managerUser, []);
    vi.mocked(createEmailTemplate).mockResolvedValue({ ...followUp, editable: true });
    await openNew(user);
    await fillTemplate(user, "Intro", "Hello", "Hi there");
    await user.click(screen.getByRole("checkbox", { name: /Shared with everyone/ }));
    await user.click(screen.getByRole("button", { name: "Add template" }));

    await waitFor(() => {
      expect(createEmailTemplate).toHaveBeenCalledWith({
        name: "Intro",
        subject: "Hello",
        body: "Hi there",
        shared: true,
      });
    });
  });

  it("sends nothing while a field is missing or too long", async () => {
    const { user } = await renderPage();
    await openNew(user);
    await user.click(screen.getByRole("button", { name: "Add template" }));

    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a subject.")).toBeInTheDocument();
    expect(screen.getByText("Write the message.")).toBeInTheDocument();
    expect(createEmailTemplate).not.toHaveBeenCalled();
    // The boxes stop at the API's limits.
    expect(screen.getByLabelText("Name")).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText("Subject")).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("Message")).toHaveAttribute("maxLength", "20000");
  });

  it("puts the API's error on its field: a name that is already used", async () => {
    const { user } = await renderPage();
    vi.mocked(createEmailTemplate).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "x",
      details: [{ path: "name", message: "You already have a template with this name" }],
    } satisfies ApiError);
    await openNew(user);
    await fillTemplate(user, "Checking in", "Hello", "Hi there");
    await user.click(screen.getByRole("button", { name: "Add template" }));

    expect(
      await screen.findByText("You already have a template with this name"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    // The dialog stays open with what was typed.
    expect(screen.getByLabelText("Message")).toHaveValue("Hi there");
  });

  it("says in its own words that 200 templates is the most", async () => {
    const { user } = await renderPage();
    vi.mocked(createEmailTemplate).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "No",
      details: null,
    } satisfies ApiError);
    await openNew(user);
    await fillTemplate(user, "One more", "Hello", "Hi there");
    await user.click(screen.getByRole("button", { name: "Add template" }));

    expect(await screen.findByText(/You already have 200 templates/)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("One more");
  });

  it("shows any other refusal above the form", async () => {
    const { user } = await renderPage();
    vi.mocked(createEmailTemplate).mockRejectedValue({
      code: "FORBIDDEN",
      message: "x",
      details: null,
    } satisfies ApiError);
    await openNew(user);
    await fillTemplate(user, "One more", "Hello", "Hi there");
    await user.click(screen.getByRole("button", { name: "Add template" }));

    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
  });

  it("edits a template and sends only what changed", async () => {
    const { user } = await renderPage();
    vi.mocked(updateEmailTemplate).mockResolvedValue({ ...checkIn, subject: "Any questions?" });
    await user.click(screen.getByRole("button", { name: "Edit Checking in" }));
    await screen.findByRole("dialog", { name: "Edit template" });
    expect(screen.getByLabelText("Name")).toHaveValue("Checking in");

    const subject = screen.getByLabelText("Subject");
    await user.clear(subject);
    await user.type(subject, "Any questions?");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateEmailTemplate).toHaveBeenCalledWith(checkIn.id, { subject: "Any questions?" });
    });
    expect(toast.success).toHaveBeenCalledWith("Template saved.");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes without a request when nothing was changed", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Edit Checking in" }));
    await screen.findByRole("dialog", { name: "Edit template" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(updateEmailTemplate).not.toHaveBeenCalled();
  });

  it("lets an Admin stop sharing a template", async () => {
    const { user } = await renderPage(adminUser, adminTemplates);
    vi.mocked(updateEmailTemplate).mockResolvedValue({ ...thanks, shared: false });
    await user.click(screen.getByRole("button", { name: "Edit Thanks for the call" }));
    await screen.findByRole("dialog", { name: "Edit template" });

    const box = screen.getByRole("checkbox", { name: /Shared with everyone/ });
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateEmailTemplate).toHaveBeenCalledWith(thanks.id, { shared: false });
    });
  });

  it("lists the placeholders with their token and what they stand for", async () => {
    const { user } = await renderPage();
    await openNew(user);
    await user.click(screen.getByRole("button", { name: "Insert placeholder" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(placeholders.length);
    const first = within(items[0] as HTMLElement);
    expect(first.getByText("Contact's first name")).toBeInTheDocument();
    expect(first.getByText("{{contact.firstName}}")).toBeInTheDocument();
    expect(first.getByText("The lead's or contact's first name.")).toBeInTheDocument();
  });

  it("inserts a placeholder at the cursor of the subject, and leaves the cursor behind it", async () => {
    const { user } = await renderPage();
    await openNew(user);
    const subject = screen.getByLabelText<HTMLInputElement>("Subject");
    await user.type(subject, "Hi , welcome");
    select(subject, 3);

    await insertPlaceholder(user, "Contact's first name");

    expect(subject).toHaveValue("Hi {{contact.firstName}}, welcome");
    expect(screen.getByLabelText("Message")).toHaveValue("");
    await waitFor(() => {
      expect(subject).toHaveFocus();
    });
    expect(subject.selectionStart).toBe(3 + "{{contact.firstName}}".length);
    expect(subject.selectionEnd).toBe(subject.selectionStart);

    // Typing goes on right behind it.
    await user.keyboard("!");
    expect(subject).toHaveValue("Hi {{contact.firstName}}!, welcome");
  });

  it("inserts into the message when that had the cursor last, replacing a selection", async () => {
    const { user } = await renderPage();
    await openNew(user);
    await user.type(screen.getByLabelText("Subject"), "Hello");
    const body = screen.getByLabelText<HTMLTextAreaElement>("Message");
    await user.type(body, "Dear NAME,{Enter}thanks.");
    select(body, 5, 9);

    await insertPlaceholder(user, "Contact's first name");

    expect(body).toHaveValue("Dear {{contact.firstName}},\nthanks.");
    expect(screen.getByLabelText("Subject")).toHaveValue("Hello");
    await waitFor(() => {
      expect(body).toHaveFocus();
    });
    expect(body.selectionStart).toBe(5 + "{{contact.firstName}}".length);
  });

  it("puts a placeholder at the end of the message when no box had the cursor yet", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Edit Thanks for the call" }));
    await screen.findByRole("dialog", { name: "Edit template" });
    // Opening the dialog put the focus in the first box; the message was never touched.
    await insertPlaceholder(user, "Your name");

    const values = [
      screen.getByLabelText<HTMLInputElement>("Name").value,
      screen.getByLabelText<HTMLInputElement>("Subject").value,
      screen.getByLabelText<HTMLTextAreaElement>("Message").value,
    ];
    expect(values).toEqual([
      "Thanks for the call",
      "Thanks for the call",
      "Thanks for the call earlier.{{sender.name}}",
    ]);
  });

  it("deletes a template after asking, and says that sent emails keep their text", async () => {
    const { user } = await renderPage();
    vi.mocked(deleteEmailTemplate).mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Delete Thanks for the call" }));

    const dialog = within(await screen.findByRole("alertdialog"));
    expect(dialog.getByText("Delete Thanks for the call?")).toBeInTheDocument();
    expect(dialog.getByText(/Emails already sent keep their text/)).toBeInTheDocument();
    expect(deleteEmailTemplate).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteEmailTemplate).toHaveBeenCalledWith(thanks.id);
    });
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    expect(screen.queryByText("Thanks for the call")).not.toBeInTheDocument();
  });

  it("keeps the template and says why when the delete is refused", async () => {
    const { user, store } = await renderPage();
    vi.mocked(deleteEmailTemplate).mockRejectedValue({
      code: "FORBIDDEN",
      message: "x",
      details: null,
    } satisfies ApiError);
    await user.click(screen.getByRole("button", { name: "Delete Thanks for the call" }));
    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    expect(await dialog.findByText("You do not have permission to do that.")).toBeInTheDocument();
    expect(store.getState().emailTemplates.list.data).toEqual(templates);
  });
});
