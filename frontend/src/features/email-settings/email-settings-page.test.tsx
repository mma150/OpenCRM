import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import type { ApiError } from "@/lib/api/http";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  getEmailSettings,
  removeEmailSettings,
  saveEmailSettings,
  sendTestEmail,
} from "./email-settings.api";
import { environmentSettings, noSettings, savedSettings } from "./email-settings.fixtures";
import type { EmailSettings } from "./email-settings.types";
import { EmailSettingsPage } from "./email-settings-page";

vi.mock("./email-settings.api");

// What the form sends for `savedSettings` when nothing was touched: everything but a password.
const savedInput = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  username: "mailer",
  fromName: "Northwind CRM",
  fromAddress: "crm@northwind.example",
  replyTo: "sales@northwind.example",
};

const resaved: EmailSettings = { ...savedSettings, updatedAt: "2026-10-02T09:00:00.000Z" };

async function renderSettings(settings: EmailSettings = savedSettings) {
  vi.mocked(getEmailSettings).mockResolvedValue(settings);
  const view = renderWithStore(<EmailSettingsPage />, { me: adminUser });
  await screen.findByLabelText("Host");
  return view;
}

function save(user: ReturnType<typeof renderWithStore>["user"]) {
  return user.click(screen.getByRole("button", { name: "Save" }));
}

describe("EmailSettingsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["a Sales Manager", managerUser],
    ["a Sales Rep", repUser],
    ["a Read-only user", readOnlyUser],
  ])("tells %s they have no access and does not ask the API", (_label, me) => {
    renderWithStore(<EmailSettingsPage />, { me });

    expect(screen.getByText("You do not have access to Email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(getEmailSettings).not.toHaveBeenCalled();
  });

  it("shows loading, then settings saved in OpenCRM with the password left out", async () => {
    vi.mocked(getEmailSettings).mockResolvedValue(savedSettings);
    renderWithStore(<EmailSettingsPage />, { me: adminUser });

    expect(screen.getByText("Loading email settings...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Saved in OpenCRM" })).toBeInTheDocument();
    expect(screen.getByText("Email is on")).toBeInTheDocument();
    expect(screen.getByText(/It wins over the server's SMTP_\* environment/)).toBeInTheDocument();

    expect(screen.getByLabelText("Host")).toHaveValue("smtp.example.com");
    expect(screen.getByLabelText("Port")).toHaveValue("587");
    expect(screen.getByRole("combobox", { name: "Encryption" })).toHaveTextContent(
      "STARTTLS or none (usually port 587 or 25)",
    );
    expect(screen.getByLabelText("Username")).toHaveValue("mailer");
    expect(screen.getByLabelText("From name")).toHaveValue("Northwind CRM");
    expect(screen.getByLabelText("From address")).toHaveValue("crm@northwind.example");
    expect(screen.getByLabelText("Reply-to")).toHaveValue("sales@northwind.example");
    // Write-only: empty, and it says a password is stored.
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "Saved (leave empty to keep it)",
    );
    expect(screen.getByRole("button", { name: "Remove saved settings" })).toBeInTheDocument();
  });

  it("says when the settings come from the server's environment, and what saving does", async () => {
    await renderSettings(environmentSettings);

    expect(
      screen.getByRole("heading", { name: "From the server's environment (SMTP_* variables)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Email is on")).toBeInTheDocument();
    expect(screen.getByText(/The form shows the values in effect; saving it stores/)).toBeVisible();
    // The values in effect.
    expect(screen.getByLabelText("Host")).toHaveValue("mailpit");
    expect(screen.getByLabelText("Port")).toHaveValue("1025");
    expect(screen.getByLabelText("From address")).toHaveValue("no-reply@opencrm.local");
    // Nothing is saved, so there is nothing to remove.
    expect(screen.queryByRole("button", { name: "Remove saved settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove password" })).not.toBeInTheDocument();
  });

  it("does not offer to keep a password that is only in the environment", async () => {
    await renderSettings({ ...environmentSettings, username: "mailer", hasPassword: true });

    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "Set in the environment",
    );
    expect(
      screen.getByText("The environment's password is not copied. Enter it again to save it here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove password" })).not.toBeInTheDocument();
  });

  it("says when email is off and starts from an empty form", async () => {
    await renderSettings(noSettings);

    expect(screen.getByRole("heading", { name: "Email is off" })).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText(/invite and reset links are shown for you to copy/)).toBeVisible();
    expect(screen.getByLabelText("Host")).toHaveValue("");
    expect(screen.getByLabelText("Port")).toHaveValue("587");
    expect(screen.queryByRole("button", { name: "Remove saved settings" })).not.toBeInTheDocument();
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(getEmailSettings)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(savedSettings);
    const { user } = renderWithStore(<EmailSettingsPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText("Host")).toBeInTheDocument();
  });

  it("keeps the stored password when the field is left empty: no password key is sent", async () => {
    vi.mocked(saveEmailSettings).mockResolvedValue(resaved);
    const { user } = await renderSettings();

    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "2525");
    await save(user);

    await waitFor(() => {
      expect(saveEmailSettings).toHaveBeenCalledWith({ ...savedInput, port: 2525 });
    });
    expect(vi.mocked(saveEmailSettings).mock.calls[0]?.[0]).not.toHaveProperty("password");
  });

  it("sends a password that was typed, and starts over with an empty box", async () => {
    vi.mocked(saveEmailSettings).mockResolvedValue(resaved);
    const { user } = await renderSettings();

    await user.type(screen.getByLabelText("Password"), "new secret");
    await save(user);

    await waitFor(() => {
      expect(saveEmailSettings).toHaveBeenCalledWith({ ...savedInput, password: "new secret" });
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Password")).toHaveValue("");
    });
  });

  it("removes the password with password null, and can change its mind first", async () => {
    vi.mocked(saveEmailSettings).mockResolvedValue({ ...resaved, hasPassword: false });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Remove password" }));
    expect(screen.getByLabelText("Password")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "Will be removed when you save",
    );
    await user.click(screen.getByRole("button", { name: "Keep password" }));
    expect(screen.getByLabelText("Password")).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Remove password" }));
    await save(user);

    await waitFor(() => {
      expect(saveEmailSettings).toHaveBeenCalledWith({ ...savedInput, password: null });
    });
    // Nothing is stored any more, so there is nothing left to remove.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove password" })).not.toBeInTheDocument();
    });
  });

  it("maps the encryption choice onto secure and sends empty text as null", async () => {
    vi.mocked(saveEmailSettings).mockResolvedValue(resaved);
    const { user } = await renderSettings(noSettings);

    await user.type(screen.getByLabelText("Host"), "smtp.example.com");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "465");
    await user.click(screen.getByRole("combobox", { name: "Encryption" }));
    await user.click(await screen.findByRole("option", { name: "TLS (usually port 465)" }));
    await user.type(screen.getByLabelText("From address"), "crm@northwind.example");
    await save(user);

    await waitFor(() => {
      expect(saveEmailSettings).toHaveBeenCalledWith({
        host: "smtp.example.com",
        port: 465,
        secure: true,
        username: null,
        fromName: null,
        fromAddress: "crm@northwind.example",
        replyTo: null,
      });
    });
  });

  it("asks for the username before sending a password without one", async () => {
    const { user } = await renderSettings(noSettings);

    await user.type(screen.getByLabelText("Host"), "smtp.example.com");
    await user.type(screen.getByLabelText("From address"), "crm@northwind.example");
    await user.type(screen.getByLabelText("Password"), "secret");
    await save(user);

    expect(
      await screen.findByText("Enter the username the password belongs to."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(saveEmailSettings).not.toHaveBeenCalled();
  });

  it("sends nothing while a field is not valid", async () => {
    const { user } = await renderSettings(noSettings);

    await user.type(screen.getByLabelText("Host"), "https://smtp.example.com");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "70000");
    await user.type(screen.getByLabelText("From name"), "CRM <sales>");
    await user.type(screen.getByLabelText("Reply-to"), "nobody");
    await save(user);

    expect(
      await screen.findByText(
        "Enter a host name such as smtp.example.com, without http:// or a port.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a port from 1 to 65535.")).toBeInTheDocument();
    expect(screen.getByText('Leave out <, > and ".')).toBeInTheDocument();
    // The From address is needed; the Reply-to is not, but must be an address when given.
    expect(screen.getAllByText("Enter a valid email address.")).toHaveLength(2);
    expect(saveEmailSettings).not.toHaveBeenCalled();
  });

  it("puts the API's field errors on their fields and keeps what was typed", async () => {
    vi.mocked(saveEmailSettings).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [
        { path: "username", message: "Enter the username the password belongs to" },
        { path: "host", message: "Enter a host name such as smtp.example.com" },
      ],
    });
    const { user } = await renderSettings();

    await user.type(screen.getByLabelText("Password"), "typed secret");
    await save(user);

    expect(
      await screen.findByText("Enter the username the password belongs to"),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a host name such as smtp.example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Host")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveValue("typed secret");
  });

  it("explains ENCRYPTION_KEY_MISSING above the form and keeps the draft", async () => {
    vi.mocked(saveEmailSettings).mockRejectedValue({
      code: "ENCRYPTION_KEY_MISSING",
      message: "Server text",
      details: null,
    });
    const { user } = await renderSettings();

    await user.type(screen.getByLabelText("Password"), "typed secret");
    await save(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The password cannot be stored: the server has no SETTINGS_ENCRYPTION_KEY. Nothing was saved.",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("typed secret");
  });

  it("says why no password can be stored without the encryption key, and still saves", async () => {
    vi.mocked(saveEmailSettings).mockResolvedValue({ ...resaved, canStorePassword: false });
    const { user } = await renderSettings({ ...environmentSettings, canStorePassword: false });

    expect(screen.getByText(/This server has no SETTINGS_ENCRYPTION_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/A mail server that needs no login can still be saved/)).toBeVisible();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "Cannot be stored on this server",
    );

    await save(user);
    await waitFor(() => {
      expect(saveEmailSettings).toHaveBeenCalledWith({
        host: "mailpit",
        port: 1025,
        secure: false,
        username: null,
        fromName: "OpenCRM",
        fromAddress: "no-reply@opencrm.local",
        replyTo: null,
      });
    });
  });

  it("warns when the saved password can no longer be read", async () => {
    await renderSettings({ ...savedSettings, passwordUnreadable: true });

    expect(screen.getByText(/The saved password can no longer be read/)).toBeInTheDocument();
    expect(screen.getByText(/enter the password again and save/)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "Enter the password again",
    );
  });

  describe("Send test email", () => {
    const failures: [string, ApiError, string][] = [
      [
        "EMAIL_NOT_CONFIGURED",
        { code: "EMAIL_NOT_CONFIGURED", message: "Server text", details: null },
        "Outgoing email is not set up, so nothing was sent.",
      ],
      [
        "EMAIL_SEND_FAILED",
        {
          code: "EMAIL_SEND_FAILED",
          message: "The mail server could not be reached.",
          details: null,
        },
        "The email was not sent. The mail server could not be reached.",
      ],
      [
        "RATE_LIMITED",
        { code: "RATE_LIMITED", message: "Server text", details: { retryAfterSeconds: 120 } },
        "Too many attempts. Try again in 2 minutes.",
      ],
    ];

    it("goes to the signed-in user by default and says that unsaved changes are not tested", async () => {
      vi.mocked(sendTestEmail).mockResolvedValue({ sent: true, to: adminUser.email });
      const { user } = await renderSettings();

      expect(screen.getByLabelText("Send to")).toHaveValue(adminUser.email);
      expect(
        screen.getByText(/Changes in the form above are not tested until you save them/),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Send test email" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        `Test email sent to ${adminUser.email}.`,
      );
      expect(sendTestEmail).toHaveBeenCalledWith(adminUser.email);
      // The mail server form was not sent with it.
      expect(saveEmailSettings).not.toHaveBeenCalled();
    });

    it("sends to another address", async () => {
      vi.mocked(sendTestEmail).mockResolvedValue({ sent: true, to: "ops@northwind.example" });
      const { user } = await renderSettings();

      await user.clear(screen.getByLabelText("Send to"));
      await user.type(screen.getByLabelText("Send to"), "ops@northwind.example");
      await user.click(screen.getByRole("button", { name: "Send test email" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Test email sent to ops@northwind.example.",
      );
    });

    it.each(failures)(
      "explains %s and takes back an earlier success",
      async (_code, error, text) => {
        vi.mocked(sendTestEmail)
          .mockResolvedValueOnce({ sent: true, to: adminUser.email })
          .mockRejectedValueOnce(error);
        const { user } = await renderSettings();

        await user.click(screen.getByRole("button", { name: "Send test email" }));
        expect(await screen.findByRole("status")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Send test email" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      },
    );

    it("sends nothing to something that is not an address", async () => {
      const { user } = await renderSettings();

      await user.clear(screen.getByLabelText("Send to"));
      await user.type(screen.getByLabelText("Send to"), "nobody");
      await user.click(screen.getByRole("button", { name: "Send test email" }));

      expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
      expect(sendTestEmail).not.toHaveBeenCalled();
    });

    it("puts the API's complaint about the address on the field", async () => {
      vi.mocked(sendTestEmail).mockRejectedValue({
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: [{ path: "to", message: "Enter a valid email" }],
      });
      const { user } = await renderSettings();

      await user.click(screen.getByRole("button", { name: "Send test email" }));

      expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
      expect(screen.getByLabelText("Send to")).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("Remove saved settings", () => {
    it("asks first, saying where email goes back to, then shows what is in effect", async () => {
      vi.mocked(removeEmailSettings).mockResolvedValue(environmentSettings);
      const { user } = await renderSettings();

      await user.click(screen.getByRole("button", { name: "Remove saved settings" }));
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent(
        "Email then goes back to the settings in the server's environment (the SMTP_* variables), or is switched off when there are none.",
      );
      expect(removeEmailSettings).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Remove saved settings" }));

      expect(
        await screen.findByRole("heading", {
          name: "From the server's environment (SMTP_* variables)",
        }),
      ).toBeInTheDocument();
      expect(removeEmailSettings).toHaveBeenCalledTimes(1);
      // The form starts again from the settings in effect.
      expect(screen.getByLabelText("Host")).toHaveValue("mailpit");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove saved settings" })).toBeNull();
    });

    it("says email is off when the environment has no mail server either", async () => {
      vi.mocked(removeEmailSettings).mockResolvedValue(noSettings);
      const { user } = await renderSettings();

      await user.click(screen.getByRole("button", { name: "Remove saved settings" }));
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: "Remove saved settings",
        }),
      );

      expect(await screen.findByRole("heading", { name: "Email is off" })).toBeInTheDocument();
    });

    it("does nothing when cancelled", async () => {
      const { user } = await renderSettings();

      await user.click(screen.getByRole("button", { name: "Remove saved settings" }));
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
      );

      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      });
      expect(removeEmailSettings).not.toHaveBeenCalled();
    });

    it("explains a refusal in the dialog, which stays open", async () => {
      vi.mocked(removeEmailSettings).mockRejectedValue({
        code: "FORBIDDEN",
        message: "Server text",
        details: null,
      });
      const { user } = await renderSettings();

      await user.click(screen.getByRole("button", { name: "Remove saved settings" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Remove saved settings" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "You do not have permission to do that.",
      );
      expect(screen.getByText("Saved in OpenCRM")).toBeInTheDocument();
    });
  });
});
