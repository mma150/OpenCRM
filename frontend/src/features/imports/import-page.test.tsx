import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";
import { setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { ImportPage } from "./import-page";
import { listImportFields, previewImport, runImport } from "./imports.api";
import {
  cleanResult,
  contactImportFields,
  FAILED_CSV,
  leadImportFields,
  leadPreview,
  leadResult,
  LEADS_CSV,
} from "./imports.fixtures";
import type { ImportPreview } from "./imports.types";

vi.mock("./imports.api");
vi.mock("@/features/users/users.api");
vi.mock("@/lib/save-file", async (original) => ({
  ...(await original<typeof import("@/lib/save-file")>()),
  saveFile: vi.fn(),
}));

type TestUser = ReturnType<typeof renderWithStore>["user"];

const csvFile = (text = LEADS_CSV, name = "leads-october.csv") =>
  new File([text], name, { type: "text/csv" });

const validation = (details: { path: string; message: string }[]): ApiError => ({
  code: "VALIDATION_FAILED",
  message: "Invalid",
  details,
});

async function renderImport(me: Me = adminUser, search = "") {
  setMockLocation("/import", search);
  const view = renderWithStore(<ImportPage />, { me });
  await screen.findByRole("button", { name: "Choose a file" });
  return view;
}

const fileInput = () => screen.getByLabelText("CSV file");

// The file input accepts only .csv, which the test user respects; a file of another kind
// is handed over the way a drop would hand it.
function choose(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

async function toMapping(user: TestUser, preview: ImportPreview = leadPreview) {
  vi.mocked(previewImport).mockResolvedValue(preview);
  choose(csvFile());
  await user.click(await screen.findByRole("button", { name: "Continue" }));
  return screen.findByRole("list", { name: "Columns" });
}

async function pick(user: TestUser, column: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: `Field for ${column}` }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const currentStep = () =>
  screen.getByRole("list", { name: "Steps" }).querySelector("[aria-current]");

describe("ImportPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listImportFields).mockResolvedValue(leadImportFields);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
  });

  describe("who may import", () => {
    it("tells a Read-only user they have no access, and asks the API nothing", () => {
      setMockLocation("/import");
      renderWithStore(<ImportPage />, { me: readOnlyUser });

      expect(screen.getByText("You do not have access to Import")).toBeInTheDocument();
      expect(screen.queryByLabelText("CSV file")).not.toBeInTheDocument();
      expect(listImportFields).not.toHaveBeenCalled();
    });

    it("offers the import to an Admin, a Sales Manager and a Sales Rep", async () => {
      for (const me of [adminUser, managerUser, repUser]) {
        const { unmount } = await renderImport(me);
        expect(screen.getByRole("heading", { level: 1, name: "Import leads" })).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("step 1: the file", () => {
    it("starts with the type the list asked for, and loads its fields", async () => {
      vi.mocked(listImportFields).mockResolvedValue(contactImportFields);
      await renderImport(adminUser, "type=contacts");

      expect(
        screen.getByRole("heading", { level: 1, name: "Import contacts" }),
      ).toBeInTheDocument();
      expect(listImportFields).toHaveBeenCalledWith("CONTACT");
      expect(screen.getByRole("button", { name: "Contacts" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("link", { name: "Back to contacts" })).toHaveAttribute(
        "href",
        "/contacts",
      );
      expect(currentStep()).toHaveTextContent("Upload");
    });

    it("changes the type on the page", async () => {
      const { user } = await renderImport();

      await user.click(screen.getByRole("button", { name: "Companies" }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "Import companies" }),
      ).toBeInTheDocument();
      expect(listImportFields).toHaveBeenLastCalledWith("COMPANY");
    });

    it("says what the file must look like", async () => {
      await renderImport();

      expect(screen.getByText(/Comma-separated values/)).toBeInTheDocument();
      expect(screen.getByText(/first row holds the column names/)).toBeInTheDocument();
      expect(screen.getByText(/YYYY-MM-DD/)).toBeInTheDocument();
      expect(screen.getByText(/5 MB and 5,000 rows/)).toBeInTheDocument();
    });

    it("downloads a template with the name of every field as its header row", async () => {
      const { user } = await renderImport();

      await user.click(await screen.findByRole("button", { name: "Download template" }));

      expect(saveFile).toHaveBeenCalledTimes(1);
      const [blob, name] = vi.mocked(saveFile).mock.calls[0] as [Blob, string];
      expect(name).toBe("leads-import-template.csv");
      expect(await blob.text()).toBe("First name,Last name,Email,Company,Region\r\n");
    });

    it("refuses a file that is not .csv, without asking the API", async () => {
      await renderImport();

      choose(new File(["x"], "leads.xlsx"));

      expect(await screen.findByText(/Choose a \.csv file/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
      expect(previewImport).not.toHaveBeenCalled();
    });

    it("refuses a file over 5 MB and an empty one", async () => {
      await renderImport();

      const big = csvFile("x");
      Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
      choose(big);
      expect(await screen.findByText(/larger than 5 MB/)).toBeInTheDocument();

      choose(csvFile(""));
      expect(await screen.findByText("The file is empty.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("takes a dropped file", async () => {
      await renderImport();
      const zone = screen.getByText(/Drag a CSV file here/).closest("div") as HTMLElement;

      fireEvent.drop(zone, { dataTransfer: { files: [csvFile()] } });

      expect(await screen.findByText("leads-october.csv")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    });

    it("shows the chosen file, which can be removed again", async () => {
      const { user } = await renderImport();

      choose(csvFile());
      expect(await screen.findByText("leads-october.csv")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Remove leads-october.csv" }));

      expect(screen.queryByText("leads-october.csv")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("sends the text of the file for a preview and moves to the mapping", async () => {
      const { user } = await renderImport();

      await toMapping(user);

      expect(previewImport).toHaveBeenCalledWith("LEAD", LEADS_CSV);
      expect(currentStep()).toHaveTextContent("Map columns");
    });

    it("shows what the API says is wrong with the file, and stays on the step", async () => {
      vi.mocked(previewImport).mockRejectedValue(
        validation([{ path: "csv", message: "Two columns are named Email" }]),
      );
      const { user } = await renderImport();

      choose(csvFile());
      await user.click(await screen.findByRole("button", { name: "Continue" }));

      expect(await screen.findByText("Two columns are named Email")).toBeInTheDocument();
      expect(currentStep()).toHaveTextContent("Upload");
      // The file is still chosen, so a network hiccup does not cost the choice.
      expect(screen.getByText("leads-october.csv")).toBeInTheDocument();
    });

    it("explains a file the API finds too large, and any other failure by its code", async () => {
      vi.mocked(previewImport)
        .mockRejectedValueOnce({ code: "PAYLOAD_TOO_LARGE", message: "x", details: null })
        .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "x", details: null });
      const { user } = await renderImport();

      choose(csvFile());
      await user.click(await screen.findByRole("button", { name: "Continue" }));
      expect(await screen.findByText(/larger than 5 MB/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByText(/server cannot be reached/)).toBeInTheDocument();
    });

    it("shows a failed load of the fields with Retry", async () => {
      vi.mocked(listImportFields).mockRejectedValueOnce({
        code: "NETWORK_ERROR",
        message: "x",
        details: null,
      } satisfies ApiError);
      setMockLocation("/import");
      const { user } = renderWithStore(<ImportPage />, { me: adminUser });

      expect(await screen.findByText(/server cannot be reached/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retry" }));

      expect(await screen.findByRole("button", { name: "Choose a file" })).toBeInTheDocument();
    });
  });

  // Many clicks through selects: slow on a busy machine, like the long form tests.
  describe("step 2: the mapping", { timeout: 20_000 }, () => {
    it("lists every column with sample values, pre-filled from the API's suggestion", async () => {
      const { user } = await renderImport();
      const columns = await toMapping(user);

      const rows = within(columns).getAllByRole("listitem");
      expect(rows).toHaveLength(5);
      expect(within(rows[0] as HTMLElement).getByText("e.g. Ada · Grace")).toBeInTheDocument();
      // An empty cell is not a sample.
      expect(within(rows[1] as HTMLElement).getByText("e.g. Lovelace")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Field for First name" })).toHaveTextContent(
        "First name (required)",
      );
      expect(screen.getByRole("combobox", { name: "Field for E-mail" })).toHaveTextContent("Email");
      expect(screen.getByRole("combobox", { name: "Field for Surname" })).toHaveTextContent(
        "Don't import",
      );
      expect(screen.getByText("2 mapped")).toBeInTheDocument();
      expect(screen.getByText("3 not imported")).toBeInTheDocument();
      expect(screen.getByText(/leads-october\.csv · 2 rows/)).toBeInTheDocument();
    });

    it("lists the required fields without a column, and keeps Import off until they have one", async () => {
      const { user } = await renderImport();
      await toMapping(user);

      const missing = screen.getByRole("list", { name: "Required fields without a column" });
      expect(
        within(missing)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Last name", "Region"]);
      expect(screen.getByRole("button", { name: "Import 2 rows" })).toBeDisabled();

      await pick(user, "Surname", "Last name (required)");
      expect(
        within(missing)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Region"]);
      await pick(user, "Area", "Region (required)");

      expect(
        screen.queryByRole("list", { name: "Required fields without a column" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import 2 rows" })).toBeEnabled();
    });

    it("does not let a field be chosen for two columns", async () => {
      const { user } = await renderImport();
      await toMapping(user);

      await user.click(screen.getByRole("combobox", { name: "Field for Surname" }));

      // Taken by the columns "First name" and "E-mail".
      expect(await screen.findByRole("option", { name: "First name (required)" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("option", { name: "Email" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("option", { name: "Last name (required)" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("option", { name: "Don't import" })).toBeInTheDocument();
    });

    it("drops a suggestion for a field that is not offered", async () => {
      const { user } = await renderImport();
      await toMapping(user, {
        ...leadPreview,
        suggestedMapping: { ...leadPreview.suggestedMapping, Area: "cf:archived" },
      });

      expect(screen.getByRole("combobox", { name: "Field for Area" })).toHaveTextContent(
        "Don't import",
      );
    });

    async function mapAll(user: TestUser) {
      await toMapping(user);
      await pick(user, "Surname", "Last name (required)");
      await pick(user, "Area", "Region (required)");
    }

    it("imports with the mapping by column name, the owner and the duplicate rule", async () => {
      vi.mocked(runImport).mockResolvedValue(leadResult);
      const { user } = await renderImport();
      await mapAll(user);

      await user.click(screen.getByRole("combobox", { name: "Owner" }));
      await user.click(await screen.findByRole("option", { name: "Rob Rep" }));
      await user.click(
        screen.getByRole("checkbox", { name: /Skip rows whose email already exists/ }),
      );
      await user.click(screen.getByRole("button", { name: "Import 2 rows" }));

      await waitFor(() => {
        expect(runImport).toHaveBeenCalledWith({
          type: "LEAD",
          csv: LEADS_CSV,
          mapping: {
            "First name": "firstName",
            Surname: "lastName",
            "E-mail": "email",
            Area: "cf:region",
            "Notes.internal": null,
          },
          ownerId: repUser.id,
          skipDuplicates: false,
        });
      });
      expect(currentStep()).toHaveTextContent("Results");
    });

    it("skips duplicates unless unticked, and sends no owner for a Sales Rep", async () => {
      vi.mocked(runImport).mockResolvedValue(cleanResult);
      const { user } = await renderImport(repUser);
      await mapAll(user);

      expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
      expect(listAssignableUsers).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Import 2 rows" }));

      await waitFor(() => {
        expect(runImport).toHaveBeenCalledTimes(1);
      });
      const input = vi.mocked(runImport).mock.calls[0]?.[0];
      expect(input).toMatchObject({ skipDuplicates: true });
      expect(input).not.toHaveProperty("ownerId");
      expect(input).not.toHaveProperty("createCompanies");
    });

    it("offers 'create missing companies' for contacts only, on unless unticked", async () => {
      vi.mocked(listImportFields).mockResolvedValue(contactImportFields);
      vi.mocked(runImport).mockResolvedValue(cleanResult);
      const { user } = await renderImport(adminUser, "type=contacts");
      await toMapping(user, {
        headers: ["First", "Last", "Org"],
        sampleRows: [["Ada", "Lovelace", "Analytical Engines"]],
        rowCount: 1,
        suggestedMapping: { First: "firstName", Last: "lastName", Org: "companyName" },
      });

      const create = screen.getByRole("checkbox", { name: /Create companies that do not exist/ });
      expect(create).toBeChecked();
      await user.click(create);
      await user.click(screen.getByRole("button", { name: "Import 1 row" }));

      await waitFor(() => {
        expect(runImport).toHaveBeenCalledWith(
          expect.objectContaining({ type: "CONTACT", createCompanies: false }),
        );
      });
    });

    it("has no such choice for leads", async () => {
      const { user } = await renderImport();
      await toMapping(user);

      expect(screen.queryByRole("checkbox", { name: /Create companies/ })).not.toBeInTheDocument();
    });

    it("puts the API's mapping errors on their columns, even one with a dot in its name", async () => {
      vi.mocked(runImport).mockRejectedValue(
        validation([
          { path: "mapping.Notes.internal", message: "This is not a field of leads" },
          { path: "mapping", message: 'Map a column to "Region"' },
          { path: "ownerId", message: "You cannot assign records to this user" },
        ]),
      );
      const { user } = await renderImport();
      await mapAll(user);
      await user.click(screen.getByRole("button", { name: "Import 2 rows" }));

      expect(await screen.findByText("This is not a field of leads")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Field for Notes.internal" })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByText('Map a column to "Region"')).toBeInTheDocument();
      expect(screen.getByText("You cannot assign records to this user")).toBeInTheDocument();
      expect(currentStep()).toHaveTextContent("Map columns");
    });

    it("goes back to step 1 with the reason when the API refuses the file itself", async () => {
      vi.mocked(runImport).mockRejectedValue(
        validation([{ path: "csv", message: "The file has more than 5,000 rows" }]),
      );
      const { user } = await renderImport();
      await mapAll(user);
      await user.click(screen.getByRole("button", { name: "Import 2 rows" }));

      expect(await screen.findByText("The file has more than 5,000 rows")).toBeInTheDocument();
      expect(currentStep()).toHaveTextContent("Upload");
      expect(screen.getByRole("button", { name: "Choose a file" })).toBeInTheDocument();
    });

    it("shows any other failure above the mapping and keeps the choices", async () => {
      vi.mocked(runImport).mockRejectedValue({
        code: "FORBIDDEN",
        message: "x",
        details: null,
      } satisfies ApiError);
      const { user } = await renderImport();
      await mapAll(user);
      await user.click(screen.getByRole("button", { name: "Import 2 rows" }));

      expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Field for Surname" })).toHaveTextContent(
        "Last name (required)",
      );
    });

    it("goes back to the file with Back", async () => {
      const { user } = await renderImport();
      await toMapping(user);

      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(await screen.findByRole("button", { name: "Choose a file" })).toBeInTheDocument();
      expect(runImport).not.toHaveBeenCalled();
    });
  });

  describe("step 3: the results", { timeout: 20_000 }, () => {
    async function toResults(result = leadResult) {
      vi.mocked(runImport).mockResolvedValue(result);
      const view = await renderImport();
      await toMapping(view.user);
      await pick(view.user, "Surname", "Last name (required)");
      await pick(view.user, "Area", "Region (required)");
      await view.user.click(screen.getByRole("button", { name: "Import 2 rows" }));
      await screen.findByText("The import is finished.");
      return view;
    }
    const tile = (label: string) => screen.getByText(label).nextElementSibling;

    it("shows the totals", async () => {
      await toResults();

      expect(tile("Created")).toHaveTextContent("1");
      expect(tile("Skipped")).toHaveTextContent("0");
      expect(tile("Failed")).toHaveTextContent("1");
      // Companies are created for contacts only.
      expect(screen.queryByText("Companies created")).not.toBeInTheDocument();
      expect(screen.getByText(/1 of 2 rows of leads-october\.csv/)).toBeInTheDocument();
    });

    it("lists each failed row with its spreadsheet row number, the reasons and its values", async () => {
      await toResults();

      const rows = within(screen.getByRole("list", { name: "Rows that failed" }));
      expect(rows.getByText("Row 3")).toBeInTheDocument();
      expect(rows.getByText("Enter a last name")).toBeInTheDocument();
      expect(rows.getByText("Last name:")).toBeInTheDocument();
      expect(rows.getByText("Enter a valid email address")).toBeInTheDocument();
      expect(rows.getByText("grace@example")).toBeInTheDocument();
      expect(rows.getByText("South")).toBeInTheDocument();
      // An empty cell of the row is left out.
      expect(rows.queryByText("Surname:")).not.toBeInTheDocument();
    });

    it("downloads the failed rows exactly as the API wrote them", async () => {
      const { user } = await toResults();

      await user.click(screen.getByRole("button", { name: "Download failed rows" }));

      const [blob, name] = vi.mocked(saveFile).mock.calls[0] as [Blob, string];
      expect(name).toBe("leads-october-failed-rows.csv");
      expect(blob.type).toBe("text/csv;charset=utf-8");
      // Byte for byte, the byte order mark included.
      expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([
        ...new TextEncoder().encode(FAILED_CSV),
      ]);
    });

    it("has no failed rows section, and no download, when every row went in", async () => {
      await toResults(cleanResult);

      expect(screen.queryByText("Rows that failed")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Download failed rows" }),
      ).not.toBeInTheDocument();
      expect(tile("Skipped")).toHaveTextContent("1");
    });

    it("says when only the first failed rows are listed", async () => {
      await toResults({ ...leadResult, failed: 350, errorsTruncated: true });

      expect(
        screen.getByText(/Only the first 1 of 350 failed rows are listed/),
      ).toBeInTheDocument();
    });

    it("links to the list, and starts over with Import another file", async () => {
      const { user } = await toResults();

      expect(screen.getByRole("link", { name: "View leads" })).toHaveAttribute("href", "/leads");
      await user.click(screen.getByRole("button", { name: "Import another file" }));

      expect(await screen.findByRole("button", { name: "Choose a file" })).toBeInTheDocument();
      expect(currentStep()).toHaveTextContent("Upload");
      expect(screen.queryByText("leads-october.csv")).not.toBeInTheDocument();
    });

    it("counts the companies an import of contacts created", async () => {
      vi.mocked(listImportFields).mockResolvedValue(contactImportFields);
      vi.mocked(runImport).mockResolvedValue(cleanResult);
      const { user } = await renderImport(adminUser, "type=contacts");
      await toMapping(user, {
        headers: ["First", "Last"],
        sampleRows: [["Ada", "Lovelace"]],
        rowCount: 1,
        suggestedMapping: { First: "firstName", Last: "lastName" },
      });
      await user.click(screen.getByRole("button", { name: "Import 1 row" }));

      await screen.findByText("The import is finished.");
      expect(tile("Companies created")).toHaveTextContent("1");
      expect(screen.getByRole("link", { name: "View contacts" })).toHaveAttribute(
        "href",
        "/contacts",
      );
    });
  });
});
