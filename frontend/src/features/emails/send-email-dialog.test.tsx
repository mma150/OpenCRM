import { act, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getEmailStatus } from "@/features/email-settings/email-settings.api";
import {
  listEmailPlaceholders,
  listEmailTemplates,
} from "@/features/email-templates/email-templates.api";
import {
  checkIn,
  followUp,
  placeholders,
  templates,
} from "@/features/email-templates/email-templates.fixtures";
import { Timeline } from "@/features/timeline/timeline";
import { listTimeline } from "@/features/timeline/timeline.api";
import {
  call,
  created,
  emailSent,
  leadRecord,
  savedEntry,
  timelinePage,
} from "@/features/timeline/timeline.fixtures";
import type { ApiError } from "@/lib/api/http";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { getEmailDefaults, previewEmail, sendEmail } from "./emails.api";
import type { EmailRecipient } from "./emails.types";
import { SendEmailButton } from "./send-email-button";
import { SendEmailDialog, type SendEmailDialogProps } from "./send-email-dialog";

vi.mock("./emails.api");
vi.mock("@/features/email-settings/email-settings.api");
vi.mock("@/features/email-templates/email-templates.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const RECORD = { type: "LEAD", id: leadRecord.id } as const;
const marcus: EmailRecipient = {
  name: "Marcus Chen",
  email: "marcus.chen@acme.example",
  contactId: null,
};
const elena: EmailRecipient = {
  name: "Elena Rostova",
  email: "Elena.Rostova@northwind.example",
  contactId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
};

const onOpenChange = vi.fn();

function mockApi(recipients: EmailRecipient[] = [marcus], enabled = true) {
  vi.mocked(getEmailDefaults).mockResolvedValue({ recipients });
  vi.mocked(getEmailStatus).mockResolvedValue({ enabled });
  vi.mocked(listEmailTemplates).mockResolvedValue(templates);
  vi.mocked(listEmailPlaceholders).mockResolvedValue(placeholders);
}

async function renderComposer(
  props: Partial<SendEmailDialogProps> = {},
  options: { me?: Me; recipients?: EmailRecipient[]; enabled?: boolean } = {},
) {
  mockApi(options.recipients, options.enabled);
  const view = renderWithStore(
    <SendEmailDialog
      open
      onOpenChange={onOpenChange}
      record={RECORD}
      recordName="Marcus Chen"
      {...props}
    />,
    { me: options.me ?? repUser },
  );
  await screen.findByRole("dialog");
  // The defaults, the templates and the status have all answered.
  await screen.findByRole("combobox", { name: "Template" });
  await waitFor(() => {
    expect(getEmailDefaults).toHaveBeenCalled();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

const toBox = () => screen.getByLabelText<HTMLInputElement>("To");
const subjectBox = () => screen.getByLabelText<HTMLInputElement>("Subject");
const bodyBox = () => screen.getByLabelText<HTMLTextAreaElement>("Message");
const sendButton = () => screen.getByRole("button", { name: "Send email" });
// The addresses that are chips in a box: each has a "Remove <address>" button.
const chips = () =>
  screen
    .queryAllByRole("button", { name: /^Remove / })
    .map((button) => button.getAttribute("aria-label")?.replace("Remove ", ""));

async function write(user: TestUser, subject = "Hello", body = "Hi Marcus") {
  await user.type(subjectBox(), subject);
  await user.type(bodyBox(), body);
}

// Text with {{placeholders}} is pasted: typing "{" means something to user-event.
async function paste(user: TestUser, subject: string, body: string) {
  await user.click(subjectBox());
  await user.paste(subject);
  await user.click(bodyBox());
  await user.paste(body);
}

async function chooseTemplate(user: TestUser, name: string) {
  await user.click(screen.getByRole("combobox", { name: "Template" }));
  await user.click(await screen.findByRole("option", { name }));
}

const sentEntry = () => savedEntry({ ...emailSent, occurredAt: new Date().toISOString() });

function apiError(code: ApiError["code"], details: unknown = null, message = "Server text") {
  return { code, message, details } satisfies ApiError;
}

// The composer tests click through many controls: slow on a busy machine.
describe("SendEmailDialog", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders nothing and asks the API nothing while it is closed", () => {
    mockApi();
    renderWithStore(
      <SendEmailDialog open={false} onOpenChange={onOpenChange} record={RECORD} recordName="M" />,
      { me: repUser },
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getEmailDefaults).not.toHaveBeenCalled();
    expect(getEmailStatus).not.toHaveBeenCalled();
  });

  it("fills To from the record's defaults and says whose timeline it joins", async () => {
    await renderComposer();

    expect(getEmailDefaults).toHaveBeenCalledWith(RECORD);
    expect(chips()).toEqual(["marcus.chen@acme.example"]);
    // The chip shows the name that belongs to the address.
    expect(screen.getByText("Marcus Chen", { selector: "span.font-medium" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Send email" })).toHaveTextContent(
      /replies go to rob@example.com\. The email is added to the timeline of Marcus Chen/,
    );
  });

  it("uses the title, the note and the starting text a quote hands over", async () => {
    await renderComposer({
      title: "Email quote Q-0001",
      note: "The quote is added below your message as text.",
      initial: { subject: "Your quote Q-0001", body: "Please find our quote below." },
    });

    expect(screen.getByRole("dialog", { name: "Email quote Q-0001" })).toBeInTheDocument();
    expect(screen.getByText("The quote is added below your message as text.")).toBeInTheDocument();
    expect(subjectBox()).toHaveValue("Your quote Q-0001");
    expect(bodyBox()).toHaveValue("Please find our quote below.");
  });

  it("leaves To empty for a record without an address, for the user to type one", async () => {
    const { user } = await renderComposer({}, { recipients: [] });
    expect(chips()).toEqual([]);

    await user.type(toBox(), "New.Person@Acme.example{Enter}");
    expect(chips()).toEqual(["new.person@acme.example"]);
    expect(toBox()).toHaveValue("");
  });

  it("opens with an empty To when the defaults cannot be loaded", async () => {
    mockApi();
    vi.mocked(getEmailDefaults).mockRejectedValue(apiError("NETWORK_ERROR"));
    renderWithStore(
      <SendEmailDialog open onOpenChange={onOpenChange} record={RECORD} recordName="Marcus" />,
      { me: repUser },
    );

    await screen.findByRole("combobox", { name: "Template" });
    expect(chips()).toEqual([]);
    expect(toBox()).toBeEnabled();
  });

  it("offers a company's contacts to pick from instead of writing to all of them", async () => {
    const { user } = await renderComposer({}, { recipients: [marcus, elena] });
    expect(chips()).toEqual([]);

    const suggestions = within(screen.getByRole("list", { name: "Suggested recipients" }));
    expect(suggestions.getAllByRole("button")).toHaveLength(2);
    await user.click(suggestions.getByRole("button", { name: /Add Elena Rostova/ }));

    expect(chips()).toEqual(["elena.rostova@northwind.example"]);
    expect(suggestions.getAllByRole("button")).toHaveLength(1);
  });

  describe("the address boxes", () => {
    it("add what was typed on Enter, on a comma and when the box is left", async () => {
      const { user } = await renderComposer({}, { recipients: [] });

      await user.type(toBox(), "a@x.co{Enter}");
      await user.type(toBox(), "b@x.co,");
      await user.type(toBox(), "c@x.co");
      await user.click(subjectBox());

      expect(chips()).toEqual(["a@x.co", "b@x.co", "c@x.co"]);
      expect(toBox()).toHaveValue("");
    });

    it("take several pasted addresses at once", async () => {
      const { user } = await renderComposer({}, { recipients: [] });
      await user.click(toBox());
      await user.paste("a@x.co; B@x.co\nc@x.co");

      expect(chips()).toEqual(["a@x.co", "b@x.co", "c@x.co"]);
    });

    it("remove an address with its button, and the last one with Backspace", async () => {
      const { user } = await renderComposer({}, { recipients: [] });
      await user.type(toBox(), "a@x.co,b@x.co,c@x.co,");

      await user.click(screen.getByRole("button", { name: "Remove b@x.co" }));
      expect(chips()).toEqual(["a@x.co", "c@x.co"]);

      await user.click(toBox());
      await user.keyboard("{Backspace}");
      expect(chips()).toEqual(["a@x.co"]);
    });

    it("keep what is not an address in the box, with the reason", async () => {
      const { user } = await renderComposer({}, { recipients: [] });
      await user.type(toBox(), "marcus@{Enter}");

      expect(chips()).toEqual([]);
      expect(toBox()).toHaveValue("marcus@");
      expect(toBox()).toHaveAttribute("aria-invalid", "true");
      expect(
        screen.getByText('"marcus@" is not a valid email address. Correct it or clear it.'),
      ).toBeInTheDocument();

      // Typing on clears the message.
      await user.type(toBox(), "acme.example{Enter}");
      expect(chips()).toEqual(["marcus@acme.example"]);
      expect(screen.queryByText(/is not a valid email address/)).not.toBeInTheDocument();
    });

    it("ignore an address that is already there, whatever its case", async () => {
      const { user } = await renderComposer();
      await user.type(toBox(), "MARCUS.CHEN@acme.example{Enter}");

      expect(chips()).toEqual(["marcus.chen@acme.example"]);
      expect(toBox()).toHaveValue("");
    });

    it("stop at ten addresses", async () => {
      const { user } = await renderComposer({}, { recipients: [] });
      const ten = Array.from({ length: 10 }, (_, index) => `p${String(index)}@x.co`);
      await user.click(toBox());
      await user.paste(ten.join(", "));
      expect(chips()).toHaveLength(10);

      await user.type(toBox(), "late@x.co{Enter}");
      expect(chips()).toHaveLength(10);
      expect(screen.getByText("Use 10 addresses or fewer.")).toBeInTheDocument();
      expect(toBox()).toHaveValue("late@x.co");
    });

    it("show Cc only when asked for, and send it", async () => {
      const { user } = await renderComposer();
      vi.mocked(sendEmail).mockResolvedValue(sentEntry());
      expect(screen.queryByLabelText("Cc")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Add Cc" }));
      await user.type(screen.getByLabelText("Cc"), "Mia@example.com{Enter}");
      await write(user);
      await user.click(sendButton());

      await waitFor(() => {
        expect(sendEmail).toHaveBeenCalledWith({
          record: RECORD,
          to: ["marcus.chen@acme.example"],
          cc: ["mia@example.com"],
          subject: "Hello",
          body: "Hi Marcus",
        });
      });
    });
  });

  describe("templates", () => {
    it("lists the user's templates and marks the shared ones of other people", async () => {
      const { user } = await renderComposer();
      await user.click(screen.getByRole("combobox", { name: "Template" }));

      const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
      expect(options).toEqual([
        "Checking in",
        "Follow-up after demo (shared)",
        "Thanks for the call",
      ]);
    });

    it("has no picker for a user without templates", async () => {
      mockApi();
      vi.mocked(listEmailTemplates).mockResolvedValue([]);
      renderWithStore(
        <SendEmailDialog open onOpenChange={onOpenChange} record={RECORD} recordName="Marcus" />,
        { me: repUser },
      );

      await screen.findByLabelText("Subject");
      await waitFor(() => {
        expect(listEmailTemplates).toHaveBeenCalled();
      });
      expect(screen.queryByRole("combobox", { name: "Template" })).not.toBeInTheDocument();
    });

    it("fill in the subject and the message, and the id is sent with the email", async () => {
      const { user } = await renderComposer();
      vi.mocked(sendEmail).mockResolvedValue(sentEntry());
      await chooseTemplate(user, "Checking in");

      expect(subjectBox()).toHaveValue(checkIn.subject);
      expect(bodyBox()).toHaveValue(checkIn.body);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

      await user.click(sendButton());
      await waitFor(() => {
        expect(sendEmail).toHaveBeenCalledWith({
          record: RECORD,
          to: ["marcus.chen@acme.example"],
          subject: checkIn.subject,
          body: checkIn.body,
          templateId: checkIn.id,
        });
      });
    });

    it("replace another template's untouched text without asking", async () => {
      const { user } = await renderComposer();
      await chooseTemplate(user, "Checking in");
      await chooseTemplate(user, "Follow-up after demo (shared)");

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(subjectBox()).toHaveValue(followUp.subject);
      expect(bodyBox()).toHaveValue(followUp.body);
    });

    it("ask before replacing text the user wrote, and keep it on 'Keep my text'", async () => {
      const { user } = await renderComposer();
      await write(user, "My own subject", "My own words");
      await chooseTemplate(user, "Checking in");

      const question = within(await screen.findByRole("alertdialog"));
      expect(question.getByText("Replace what you wrote?")).toBeInTheDocument();
      expect(question.getByText(/"Checking in"/)).toBeInTheDocument();
      await user.click(question.getByRole("button", { name: "Keep my text" }));

      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      });
      expect(subjectBox()).toHaveValue("My own subject");
      expect(bodyBox()).toHaveValue("My own words");
    });

    it("replace the user's text once they say so", async () => {
      const { user } = await renderComposer();
      await write(user, "My own subject", "My own words");
      await chooseTemplate(user, "Checking in");
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Replace" }),
      );

      await waitFor(() => {
        expect(subjectBox()).toHaveValue(checkIn.subject);
      });
      expect(bodyBox()).toHaveValue(checkIn.body);
    });

    it("ask too when a template's text was changed by hand", async () => {
      const { user } = await renderComposer();
      await chooseTemplate(user, "Checking in");
      await user.type(bodyBox(), " PS: see you Friday.");
      await chooseTemplate(user, "Thanks for the call");

      expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("placeholders", () => {
    it("insert at the cursor of the message, and leave the quote's ones out of a plain email", async () => {
      const { user } = await renderComposer();
      await user.type(subjectBox(), "Hello");
      await user.type(bodyBox(), "Hi , welcome");
      act(() => {
        bodyBox().setSelectionRange(3, 3);
      });
      await user.click(screen.getByRole("button", { name: "Insert placeholder" }));

      const items = await screen.findAllByRole("menuitem");
      expect(items.map((item) => item.querySelector("code")?.textContent)).toEqual([
        "{{contact.firstName}}",
        "{{company.name}}",
        "{{sender.name}}",
      ]);
      await user.click(items[0] as HTMLElement);

      expect(bodyBox()).toHaveValue("Hi {{contact.firstName}}, welcome");
      expect(subjectBox()).toHaveValue("Hello");
      await waitFor(() => {
        expect(bodyBox()).toHaveFocus();
      });
      expect(bodyBox().selectionStart).toBe(3 + "{{contact.firstName}}".length);
    });

    it("insert into the subject when that had the cursor last", async () => {
      const { user } = await renderComposer();
      await user.type(bodyBox(), "Body");
      await user.type(subjectBox(), "For ");
      await user.click(screen.getByRole("button", { name: "Insert placeholder" }));
      await user.click(await screen.findByRole("menuitem", { name: /Company name/ }));

      expect(subjectBox()).toHaveValue("For {{company.name}}");
      expect(bodyBox()).toHaveValue("Body");
    });

    it("offer the quote's placeholders on an email that carries a quote", async () => {
      const { user } = await renderComposer({ withQuotePlaceholders: true });
      await user.click(screen.getByRole("button", { name: "Insert placeholder" }));

      expect(await screen.findByRole("menuitem", { name: /Quote number/ })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /Quote total/ })).toBeInTheDocument();
    });
  });

  describe("the preview", () => {
    it("shows the email as it reads for this record, and goes back to the draft", async () => {
      const { user } = await renderComposer();
      vi.mocked(previewEmail).mockResolvedValue({
        subject: "Hello Marcus",
        body: "Hi Marcus,\nwelcome.",
        unknown: [],
        empty: [],
      });
      await paste(user, "Hello {{contact.firstName}}", "Hi {{contact.firstName}},\nwelcome.");
      await user.click(screen.getByRole("button", { name: "Preview" }));

      const preview = within(await screen.findByRole("region", { name: "Preview" }));
      expect(previewEmail).toHaveBeenCalledWith({
        record: RECORD,
        subject: "Hello {{contact.firstName}}",
        body: "Hi {{contact.firstName}},\nwelcome.",
      });
      expect(preview.getByText("Hello Marcus")).toBeInTheDocument();
      expect(preview.getByText(/Hi Marcus,\s+welcome\./)).toHaveClass("whitespace-pre-wrap");
      expect(preview.getByText("marcus.chen@acme.example")).toBeInTheDocument();
      expect(preview.queryByRole("alert")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Back to editing" }));
      expect(screen.queryByRole("region", { name: "Preview" })).not.toBeInTheDocument();
      expect(subjectBox()).toHaveValue("Hello {{contact.firstName}}");
      expect(bodyBox()).toHaveValue("Hi {{contact.firstName}},\nwelcome.");
    });

    it("warns about placeholders it does not know and ones the record has no value for", async () => {
      const { user } = await renderComposer();
      vi.mocked(previewEmail).mockResolvedValue({
        subject: "Hello",
        body: "Hi {{contact.nickname}} at ",
        unknown: ["contact.nickname"],
        empty: ["company.name"],
      });
      await write(user);
      await user.click(screen.getByRole("button", { name: "Preview" }));

      const warning = await screen.findByRole("alert");
      expect(warning).toHaveTextContent(
        "{{contact.nickname}} is not a placeholder OpenCRM knows. It will be sent as typed.",
      );
      expect(warning).toHaveTextContent(
        "{{company.name}}: this record has no value for it, so it is left blank.",
      );
    });

    it("does not warn about the quote's placeholders on an email that carries a quote", async () => {
      const { user } = await renderComposer({ withQuotePlaceholders: true });
      vi.mocked(previewEmail).mockResolvedValue({
        subject: "Quote ",
        body: "The total is ",
        unknown: [],
        empty: ["quote.number", "quote.total"],
      });
      await paste(user, "Quote {{quote.number}}", "The total is {{quote.total}}");
      await user.click(screen.getByRole("button", { name: "Preview" }));

      const preview = await screen.findByRole("region", { name: "Preview" });
      expect(within(preview).queryByRole("alert")).not.toBeInTheDocument();
      expect(preview).toHaveTextContent(
        "{{quote.number}} and {{quote.total}} are filled in when the email is sent.",
      );
    });

    it("does warn about them on a plain email, where they stay empty", async () => {
      const { user } = await renderComposer();
      vi.mocked(previewEmail).mockResolvedValue({
        subject: "Quote ",
        body: "x",
        unknown: [],
        empty: ["quote.number"],
      });
      await write(user);
      await user.click(screen.getByRole("button", { name: "Preview" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "{{quote.number}}: this record has no value for it, so it is left blank.",
      );
    });

    it("asks for a subject and a message first, and previews nothing without them", async () => {
      const { user } = await renderComposer();
      await user.click(screen.getByRole("button", { name: "Preview" }));

      expect(await screen.findByText("Enter a subject.")).toBeInTheDocument();
      expect(screen.getByText("Write the message.")).toBeInTheDocument();
      expect(previewEmail).not.toHaveBeenCalled();
    });

    it("keeps the draft and says why when the preview fails", async () => {
      const { user } = await renderComposer();
      vi.mocked(previewEmail).mockRejectedValue(apiError("NETWORK_ERROR"));
      await write(user);
      await user.click(screen.getByRole("button", { name: "Preview" }));

      expect(await screen.findByText(/The server cannot be reached/)).toBeInTheDocument();
      expect(bodyBox()).toHaveValue("Hi Marcus");
    });

    it("can send from the preview", async () => {
      const { user } = await renderComposer();
      vi.mocked(previewEmail).mockResolvedValue({
        subject: "Hello",
        body: "Hi",
        unknown: [],
        empty: [],
      });
      vi.mocked(sendEmail).mockResolvedValue(sentEntry());
      await write(user);
      await user.click(screen.getByRole("button", { name: "Preview" }));
      await screen.findByRole("region", { name: "Preview" });
      await user.click(sendButton());

      await waitFor(() => {
        expect(sendEmail).toHaveBeenCalledTimes(1);
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("sending", () => {
    it("shows progress, then a toast, closes and tells the caller", async () => {
      const onSent = vi.fn();
      const { user } = await renderComposer({ onSent });
      let finish: (entry: ReturnType<typeof sentEntry>) => void = () => undefined;
      vi.mocked(sendEmail).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      await write(user);
      await user.click(sendButton());

      const busy = await screen.findByRole("button", { name: "Sending..." });
      expect(busy).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(onOpenChange).not.toHaveBeenCalled();

      await act(async () => {
        finish(sentEntry());
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
      expect(toast.success).toHaveBeenCalledWith("Email sent to marcus.chen@acme.example.");
      expect(onSent).toHaveBeenCalledTimes(1);
    });

    it("sends nothing while To, the subject or the message is missing", async () => {
      const { user } = await renderComposer({}, { recipients: [] });
      await user.click(sendButton());

      expect(await screen.findByText("Add at least one address.")).toBeInTheDocument();
      expect(screen.getByText("Enter a subject.")).toBeInTheDocument();
      expect(screen.getByText("Write the message.")).toBeInTheDocument();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("does not send while something in To is not an address yet", async () => {
      const { user } = await renderComposer();
      await write(user);
      await user.type(toBox(), "elena@");
      await user.click(sendButton());

      expect(
        await screen.findByText(/Something in "To" is not an address yet/),
      ).toBeInTheDocument();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(toBox()).toHaveValue("elena@");
    });

    it("does not send on Enter in the subject", async () => {
      const { user } = await renderComposer();
      await user.type(bodyBox(), "Hi Marcus");
      await user.type(subjectBox(), "Hello{Enter}");

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("calls `send` instead of the API when a caller hands one over", async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const onSent = vi.fn();
      const { user } = await renderComposer({ send, onSent });
      await write(user);
      await user.click(sendButton());

      await waitFor(() => {
        expect(send).toHaveBeenCalledWith({
          to: ["marcus.chen@acme.example"],
          subject: "Hello",
          body: "Hi Marcus",
        });
      });
      expect(sendEmail).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(onSent).toHaveBeenCalledTimes(1);
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("treats a rejection of `send` like its own: the draft stays", async () => {
      const send = vi.fn().mockRejectedValue(apiError("EMAIL_SEND_FAILED", null, "Refused (550)."));
      const { user } = await renderComposer({ send });
      await write(user);
      await user.click(sendButton());

      expect(await screen.findByText("The email was not sent. Refused (550).")).toBeInTheDocument();
      expect(bodyBox()).toHaveValue("Hi Marcus");
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("when sending fails, the draft stays and the dialog stays open", () => {
    async function failWith(error: ApiError, me: Me = repUser) {
      const view = await renderComposer({}, { me });
      vi.mocked(sendEmail).mockRejectedValue(error);
      await write(view.user, "Hello", "Hi Marcus");
      await view.user.click(sendButton());
      await waitFor(() => {
        expect(sendEmail).toHaveBeenCalledTimes(1);
      });
      return view;
    }

    function expectDraftKept() {
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(chips()).toEqual(["marcus.chen@acme.example"]);
      expect(subjectBox()).toHaveValue("Hello");
      expect(bodyBox()).toHaveValue("Hi Marcus");
    }

    it("EMAIL_NOT_CONFIGURED: explains, and tells a rep to ask an Admin", async () => {
      await failWith(apiError("EMAIL_NOT_CONFIGURED"));

      expect(
        await screen.findByText(/Outgoing email is not set up, so nothing was sent/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Ask an Admin to set it up under Settings, Email/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Set up email" })).not.toBeInTheDocument();
      expectDraftKept();
    });

    it("EMAIL_NOT_CONFIGURED: gives an Admin the link to the settings", async () => {
      await failWith(apiError("EMAIL_NOT_CONFIGURED"), adminUser);

      expect(await screen.findByRole("link", { name: "Set up email" })).toHaveAttribute(
        "href",
        "/settings/email",
      );
      expectDraftKept();
    });

    it("EMAIL_SEND_FAILED: shows the API's own sentence", async () => {
      await failWith(
        apiError("EMAIL_SEND_FAILED", null, "The mail server refused the login (535)."),
      );

      expect(
        await screen.findByText("The email was not sent. The mail server refused the login (535)."),
      ).toBeInTheDocument();
      expectDraftKept();
    });

    it.each([
      [{ retryAfterSeconds: 150 }, "Try again in 3 minutes."],
      [{ retryAfterSeconds: 20 }, "Try again in 1 minute."],
      [null, "Try again in a few minutes."],
    ])("RATE_LIMITED: says when to try again (%j)", async (details, hint) => {
      await failWith(apiError("RATE_LIMITED", details));

      expect(
        await screen.findByText(
          `You have sent a lot of emails in a short time, so this one was not sent. ${hint}`,
        ),
      ).toBeInTheDocument();
      expectDraftKept();
    });

    it("VALIDATION_FAILED: puts each problem on its field, a list's by its place", async () => {
      const { user } = await failWith(
        apiError("VALIDATION_FAILED", [
          { path: "to.0", message: "Enter a valid email" },
          { path: "cc.1", message: "This address is refused" },
          { path: "subject", message: "Keep the subject on one line" },
          { path: "body", message: "The message is too long" },
          { path: "templateId", message: "This template no longer exists" },
        ]),
      );

      expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
      expect(toBox()).toHaveAttribute("aria-invalid", "true");
      // Cc was hidden: it is shown, because it has a problem.
      expect(screen.getByLabelText("Cc")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("This address is refused")).toBeInTheDocument();
      expect(screen.getByText("Keep the subject on one line")).toBeInTheDocument();
      expect(screen.getByText("The message is too long")).toBeInTheDocument();
      expect(screen.getByText("This template no longer exists")).toBeInTheDocument();
      // Every problem landed on a field, so there is no sentence above the form.
      expect(screen.queryByText(/Some of the details are not valid/)).not.toBeInTheDocument();
      expectDraftKept();
      expect(user).toBeDefined();
    });

    it.each([
      ["NOT_FOUND", "This no longer exists. Reload the page and try again."],
      ["FORBIDDEN", "You do not have permission to do that."],
      ["NETWORK_ERROR", "The server cannot be reached. Check your connection and try again."],
      ["INTERNAL_ERROR", "INTERNAL_ERROR: Server text"],
    ] as const)("%s: says so above the form", async (code, message) => {
      await failWith(apiError(code));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expectDraftKept();
    });

    it("can be sent again after a failure", async () => {
      const { user } = await failWith(apiError("EMAIL_SEND_FAILED", null, "Timed out."));
      await screen.findByText("The email was not sent. Timed out.");
      vi.mocked(sendEmail).mockResolvedValue(sentEntry());
      await user.click(sendButton());

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe("while email is off", () => {
    it("says so up front, keeps Send off, and still previews", async () => {
      const { user } = await renderComposer({}, { enabled: false });
      vi.mocked(previewEmail).mockResolvedValue({
        subject: "Hello",
        body: "Hi",
        unknown: [],
        empty: [],
      });

      expect(
        await screen.findByText(/Outgoing email is not set up, so this email cannot be sent yet/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Ask an Admin to set it up/)).toBeInTheDocument();
      expect(sendButton()).toBeDisabled();

      await write(user);
      await user.click(screen.getByRole("button", { name: "Preview" }));
      expect(await screen.findByRole("region", { name: "Preview" })).toBeInTheDocument();
      expect(sendButton()).toBeDisabled();
    });

    it("gives an Admin the link to the settings", async () => {
      await renderComposer({}, { enabled: false, me: adminUser });

      expect(await screen.findByRole("link", { name: "Set up email" })).toHaveAttribute(
        "href",
        "/settings/email",
      );
    });

    it("can check again, and lets the email go once it is on", async () => {
      const { user } = await renderComposer({}, { enabled: false });
      await screen.findByText(/cannot be sent yet/);
      vi.mocked(getEmailStatus).mockResolvedValue({ enabled: true });
      await user.click(screen.getByRole("button", { name: "Check again" }));

      await waitFor(() => {
        expect(sendButton()).toBeEnabled();
      });
      expect(screen.queryByText(/cannot be sent yet/)).not.toBeInTheDocument();
    });

    it("says nothing about it while the status is still unknown", async () => {
      mockApi();
      vi.mocked(getEmailStatus).mockReturnValue(new Promise(() => undefined));
      renderWithStore(
        <SendEmailDialog open onOpenChange={onOpenChange} record={RECORD} recordName="Marcus" />,
        { me: repUser },
      );

      await screen.findByRole("combobox", { name: "Template" });
      expect(screen.queryByText(/Outgoing email is not set up/)).not.toBeInTheDocument();
      expect(sendButton()).toBeEnabled();
    });
  });
});

describe("SendEmailButton", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders nothing for a user who may not write", () => {
    renderWithStore(<SendEmailButton record={leadRecord} recordName="Marcus" canWrite={false} />, {
      me: repUser,
    });

    expect(screen.queryByRole("button", { name: "Send email" })).not.toBeInTheDocument();
  });

  it("asks the API nothing until it is pressed", () => {
    mockApi();
    renderWithStore(<SendEmailButton record={leadRecord} recordName="Marcus" canWrite />, {
      me: repUser,
    });

    expect(screen.getByRole("button", { name: "Send email" })).toBeInTheDocument();
    expect(getEmailStatus).not.toHaveBeenCalled();
    expect(getEmailDefaults).not.toHaveBeenCalled();
    expect(listEmailTemplates).not.toHaveBeenCalled();
  });

  it("sends from the record, and the new entry joins its timeline without a reload", async () => {
    mockApi();
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
    vi.mocked(sendEmail).mockResolvedValue(sentEntry());
    const { user } = renderWithStore(
      <>
        <SendEmailButton record={leadRecord} recordName="Marcus Chen" canWrite />
        <Timeline record={leadRecord} canWrite={false} />
      </>,
      { me: repUser },
    );
    await screen.findByRole("list", { name: "Timeline entries" });

    await user.click(screen.getByRole("button", { name: "Send email" }));
    await screen.findByRole("dialog", { name: "Send email" });
    await waitFor(() => {
      expect(chips()).toEqual(["marcus.chen@acme.example"]);
    });
    await write(user, "Recap of our demo", "Hi Marcus");
    await user.click(sendButton());

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(sendEmail).toHaveBeenCalledWith({
      record: { type: "LEAD", id: leadRecord.id },
      to: ["marcus.chen@acme.example"],
      subject: "Recap of our demo",
      body: "Hi Marcus",
    });
    const items = within(screen.getByRole("list", { name: "Timeline entries" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Email sent: Recap of our demo");
    expect(screen.getByText("3 entries")).toBeInTheDocument();
    // The timeline was not asked for again.
    expect(listTimeline).toHaveBeenCalledTimes(1);
  });
});
