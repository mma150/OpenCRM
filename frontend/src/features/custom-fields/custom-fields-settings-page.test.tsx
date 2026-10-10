import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import type { ApiError } from "@/lib/api/http";
import { followNavigation, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  archiveCustomField,
  createCustomField,
  deleteCustomField,
  listAllCustomFields,
  reorderCustomFields,
  restoreCustomField,
  updateCustomField,
} from "./custom-fields.api";
import {
  channelField,
  leadFields,
  leadFieldsWithArchived,
  legacyField,
  regionField,
  renewalField,
  teamSizeField,
  tierField,
} from "./custom-fields.fixtures";
import type { CustomField } from "./custom-fields.types";
import { CustomFieldsSettingsPage } from "./custom-fields-settings-page";

vi.mock("./custom-fields.api");
vi.mock("sonner");

// What the API answers when an action does not apply: no field is named.
const notApplicable: ApiError = { code: "VALIDATION_FAILED", message: "No", details: null };

async function renderSettings(fields: CustomField[] = leadFieldsWithArchived) {
  vi.mocked(listAllCustomFields).mockResolvedValue(fields);
  const view = renderWithStore(<CustomFieldsSettingsPage />, { me: adminUser });
  await screen.findByText(/fields in use on/);
  return view;
}

const activeList = () => screen.getByRole("list", { name: "Custom fields" });
const activeRows = () => within(activeList()).getAllByRole("listitem");
const activeLabels = () =>
  activeRows().map((row) => row.querySelector("p span")?.textContent ?? "");

// The dialog tests click through many controls: slow on a busy machine, like the long form tests.
describe("CustomFieldsSettingsPage", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/settings/custom-fields");
  });

  it("tells anyone but an Admin they have no access, and does not ask the API", () => {
    for (const me of [managerUser, repUser, readOnlyUser]) {
      const { unmount } = renderWithStore(<CustomFieldsSettingsPage />, { me });
      expect(screen.getByText("You do not have access to Custom fields")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add field" })).not.toBeInTheDocument();
      unmount();
    }
    expect(listAllCustomFields).not.toHaveBeenCalled();
  });

  it("lists the fields of leads in order with type and Required, and the archived ones apart", async () => {
    await renderSettings();

    expect(listAllCustomFields).toHaveBeenCalledWith("LEAD");
    expect(activeLabels()).toEqual(["Region", "Team size", "Renewal date", "Preferred channel"]);
    const [region, teamSize] = activeRows();
    expect(within(region as HTMLElement).getByText("Dropdown · 3 options")).toBeInTheDocument();
    expect(within(region as HTMLElement).getByText("Required")).toBeInTheDocument();
    expect(within(teamSize as HTMLElement).getByText("Number")).toBeInTheDocument();
    expect(within(teamSize as HTMLElement).queryByText("Required")).not.toBeInTheDocument();
    expect(screen.getByText(/4 of 30 fields in use on leads/)).toBeInTheDocument();

    const archived = screen.getByRole("list", { name: "Archived custom fields" });
    expect(within(archived).getByText("Legacy code")).toBeInTheDocument();
    expect(within(activeList()).queryByText("Legacy code")).not.toBeInTheDocument();
  });

  it("has no Archived section when nothing is archived, and an empty state without fields", async () => {
    await renderSettings([]);

    expect(screen.getByText("No custom fields on leads yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Archived" })).not.toBeInTheDocument();
  });

  it("switches record type with the tabs, keeping the choice in the address", async () => {
    followNavigation();
    const { user } = await renderSettings();
    vi.mocked(listAllCustomFields).mockResolvedValue([tierField]);

    await user.click(screen.getByRole("button", { name: "Companies" }));

    expect(await screen.findByText("Customer tier")).toBeInTheDocument();
    expect(listAllCustomFields).toHaveBeenLastCalledWith("COMPANY");
    expect(screen.getByRole("button", { name: "Companies" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Region")).not.toBeInTheDocument();
  });

  it("opens the tab the address names", async () => {
    setMockLocation("/settings/custom-fields", "type=opportunities");
    await renderSettings([]);

    expect(listAllCustomFields).toHaveBeenCalledWith("OPPORTUNITY");
    expect(screen.getByText("No custom fields on opportunities yet")).toBeInTheDocument();
  });

  it("says when the record type is full and switches Add field off", async () => {
    const thirty = Array.from({ length: 30 }, (_, index) => ({
      ...channelField,
      id: `field-${String(index)}`,
      label: `Field ${String(index)}`,
    }));
    await renderSettings(thirty);

    expect(screen.getByText(/30 of 30 fields in use on leads/)).toHaveTextContent(
      "archive one to add another",
    );
    expect(screen.getByRole("button", { name: "Add field" })).toBeDisabled();
  });

  it("adds a text field", async () => {
    vi.mocked(createCustomField).mockResolvedValue({ ...channelField, id: "new", label: "Budget" });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Add field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a field to leads" });
    await user.type(within(dialog).getByLabelText("Label"), " Budget ");
    await user.click(within(dialog).getByRole("checkbox", { name: /Required/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add field" }));

    await waitFor(() => {
      expect(createCustomField).toHaveBeenCalledWith({
        recordType: "LEAD",
        label: "Budget",
        type: "TEXT",
        required: true,
      });
    });
    await waitFor(() => {
      expect(activeLabels()).toContain("Budget");
    });
    expect(toast.success).toHaveBeenCalledWith("Budget was added to leads.");
  });

  it("adds a dropdown with options that can be added, reordered and removed", async () => {
    vi.mocked(createCustomField).mockResolvedValue({ ...regionField, id: "new", label: "Tier" });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Add field" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Label"), "Tier");
    await user.click(within(dialog).getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Dropdown" }));

    // A dropdown needs an option.
    await user.click(within(dialog).getByRole("button", { name: "Add field" }));
    expect(await within(dialog).findByText("Add at least one option.")).toBeInTheDocument();
    expect(createCustomField).not.toHaveBeenCalled();

    for (const option of ["Silver", "Gold", "gold", "Bronze"]) {
      await user.click(within(dialog).getByRole("button", { name: "Add option" }));
      const boxes = within(dialog).getAllByRole("textbox", { name: /^Option / });
      await user.type(boxes.at(-1) as HTMLElement, option);
    }
    await user.click(within(dialog).getByRole("button", { name: "Add field" }));
    expect(await within(dialog).findByText("This option is listed twice.")).toBeInTheDocument();
    expect(createCustomField).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Remove option 3" }));
    await user.click(within(dialog).getByRole("button", { name: "Move option 2 up" }));
    await user.click(within(dialog).getByRole("button", { name: "Add field" }));

    await waitFor(() => {
      expect(createCustomField).toHaveBeenCalledWith({
        recordType: "LEAD",
        label: "Tier",
        type: "DROPDOWN",
        required: false,
        options: ["Gold", "Silver", "Bronze"],
      });
    });
  });

  it("puts the API's label error on the field, and explains the limit in its own words", async () => {
    vi.mocked(createCustomField)
      .mockRejectedValueOnce({
        code: "VALIDATION_FAILED",
        message: "Invalid",
        details: [{ path: "label", message: "Another field of leads has this label" }],
      } satisfies ApiError)
      .mockRejectedValueOnce(notApplicable);
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Add field" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Label"), "Region");
    await user.click(within(dialog).getByRole("button", { name: "Add field" }));
    expect(
      await within(dialog).findByText("Another field of leads has this label"),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Add field" }));
    expect(
      await within(dialog).findByText(/can have 30 fields in use at most/),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("edits a field with its type fixed, sending only what changed", async () => {
    vi.mocked(updateCustomField).mockResolvedValue({
      ...regionField,
      label: "Sales region",
      options: ["North", "East", "West"],
    });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Edit Region" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Region" });
    expect(within(dialog).queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("The type of a field cannot be changed.")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /Required/ })).toBeChecked();

    const label = within(dialog).getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Sales region");
    await user.click(within(dialog).getByRole("button", { name: "Remove option 2" }));
    await user.click(within(dialog).getByRole("button", { name: "Add option" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Option 3" }), "West");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateCustomField).toHaveBeenCalledWith(regionField.id, {
        label: "Sales region",
        options: ["North", "East", "West"],
      });
    });
    await waitFor(() => {
      expect(activeLabels()[0]).toBe("Sales region");
    });
  });

  it("sends nothing when an edit changes nothing", async () => {
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Edit Team size" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(updateCustomField).not.toHaveBeenCalled();
  });

  it("cannot move the first field up or the last one down", async () => {
    await renderSettings();

    expect(screen.getByRole("button", { name: "Move Region up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Region down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Preferred channel down" })).toBeDisabled();
  });

  it("moves a field with its buttons, sending every field in use in the new order", async () => {
    vi.mocked(reorderCustomFields).mockResolvedValue([
      teamSizeField,
      regionField,
      renewalField,
      channelField,
      legacyField,
    ]);
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Move Region down" }));

    await waitFor(() => {
      expect(reorderCustomFields).toHaveBeenCalledWith("LEAD", [
        teamSizeField.id,
        regionField.id,
        renewalField.id,
        channelField.id,
      ]);
    });
    await waitFor(() => {
      expect(activeLabels().slice(0, 2)).toEqual(["Team size", "Region"]);
    });
    // The button that was used keeps the focus, so the keyboard can move the field on.
    expect(screen.getByRole("button", { name: "Move Region down" })).toHaveFocus();
  });

  it("says so when a move is refused, and leaves the order alone", async () => {
    vi.mocked(reorderCustomFields).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    } satisfies ApiError);
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Move Region down" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Region could not be moved/));
    });
    expect(activeLabels()[0]).toBe("Region");
  });

  it("archives a field after asking, saying its values are kept", async () => {
    vi.mocked(archiveCustomField).mockResolvedValue({ ...teamSizeField, archived: true });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Archive Team size" }));
    const dialog = await screen.findByRole("dialog", { name: "Archive Team size?" });
    expect(within(dialog).getByText(/Its values are kept/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Archive field" }));

    await waitFor(() => {
      expect(archiveCustomField).toHaveBeenCalledWith(teamSizeField.id);
    });
    await waitFor(() => {
      expect(activeLabels()).not.toContain("Team size");
    });
    expect(
      within(screen.getByRole("list", { name: "Archived custom fields" })).getByText("Team size"),
    ).toBeInTheDocument();
  });

  it("restores an archived field, and explains the limit when the record type is full", async () => {
    vi.mocked(restoreCustomField)
      .mockRejectedValueOnce(notApplicable)
      .mockResolvedValueOnce({ ...legacyField, archived: false });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Restore Legacy code" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/can have 30 fields in use at most/),
      );
    });

    await user.click(screen.getByRole("button", { name: "Restore Legacy code" }));
    await waitFor(() => {
      expect(activeLabels().at(-1)).toBe("Legacy code");
    });
    expect(screen.queryByRole("heading", { name: "Archived" })).not.toBeInTheDocument();
  });

  it("deletes an archived field only after the Admin ticks that the values are removed", async () => {
    vi.mocked(deleteCustomField).mockResolvedValue(undefined);
    const { user } = await renderSettings();

    // Only an archived field can be deleted: a field in use has no such button.
    expect(screen.queryByRole("button", { name: /Delete Region/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Legacy code permanently" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Legacy code permanently?" });
    expect(
      within(dialog).getByText(/removes the field and the value it holds on every lead/),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete permanently" });
    expect(confirm).toBeDisabled();
    expect(deleteCustomField).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(confirm);

    await waitFor(() => {
      expect(deleteCustomField).toHaveBeenCalledWith(legacyField.id);
    });
    await waitFor(() => {
      expect(screen.queryByText("Legacy code")).not.toBeInTheDocument();
    });
  });

  it("keeps the delete dialog open and says why when the API refuses", async () => {
    vi.mocked(deleteCustomField).mockRejectedValue({
      code: "NOT_FOUND",
      message: "x",
      details: null,
    } satisfies ApiError);
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Delete Legacy code permanently" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    expect(await within(dialog).findByText(/This no longer exists/)).toBeInTheDocument();
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(listAllCustomFields).mockRejectedValueOnce({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    } satisfies ApiError);
    const { user } = renderWithStore(<CustomFieldsSettingsPage />, { me: adminUser });

    expect(await screen.findByText(/server cannot be reached/)).toBeInTheDocument();
    vi.mocked(listAllCustomFields).mockResolvedValue(leadFields);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Region")).toBeInTheDocument();
  });
});
