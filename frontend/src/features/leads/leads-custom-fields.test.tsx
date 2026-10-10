import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listCustomFields } from "@/features/custom-fields/custom-fields.api";
import {
  channelField,
  leadFields,
  regionField,
  renewalField,
  teamSizeField,
} from "@/features/custom-fields/custom-fields.fixtures";
import { listTasks } from "@/features/tasks/tasks.api";
import { taskList } from "@/features/tasks/tasks.fixtures";
import { listTimeline } from "@/features/timeline/timeline.api";
import { timelinePage } from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { LeadDetailPage } from "./lead-detail-page";
import { EditLeadPage, NewLeadPage } from "./lead-form-pages";
import { createLead, exportLeads, getLead, listLeads, updateLead } from "./leads.api";
import {
  allLeads,
  assignableUsers,
  leadList,
  managerUser,
  marcus,
  readOnlyUser,
} from "./leads.fixtures";
import type { Lead } from "./leads.types";
import { LeadsPage } from "./leads-page";

vi.mock("./leads.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("@/lib/save-file");
vi.mock("sonner");

// Marcus with a value for three of the four custom fields of leads.
const marcusWithFields: Lead = {
  ...marcus,
  customFields: {
    [regionField.id]: "North",
    [teamSizeField.id]: 40,
    [renewalField.id]: "2026-11-15",
    [channelField.id]: null,
  },
};

const region = `cf.${regionField.id}`;
const teamMin = `cf.${teamSizeField.id}.min`;

describe("custom fields on leads", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCustomFields).mockResolvedValue(leadFields);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listLeads).mockResolvedValue(leadList(allLeads));
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([]));
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    followNavigation();
  });

  describe("the list", () => {
    async function renderLeads(me: Me = adminUser, search = "") {
      setMockLocation("/leads", search);
      const view = renderWithStore(<LeadsPage />, { me });
      await screen.findByRole("table", { name: "Leads" });
      return view;
    }

    it("asks for the custom fields of leads and offers More filters", async () => {
      await renderLeads();

      expect(listCustomFields).toHaveBeenCalledWith("LEAD");
      expect(await screen.findByRole("button", { name: "More filters" })).toBeInTheDocument();
    });

    it("has no More filters when leads have no custom fields", async () => {
      vi.mocked(listCustomFields).mockResolvedValue([]);
      await renderLeads();

      expect(screen.queryByRole("button", { name: /More filters/ })).not.toBeInTheDocument();
    });

    it("loads the list with the custom filters in the address, and shows them as chips", async () => {
      await renderLeads(adminUser, `status=NEW&${region}=North&${teamMin}=10`);

      expect(listLeads).toHaveBeenCalledWith({
        status: "NEW",
        [region]: "North",
        [teamMin]: "10",
        sort: "createdAt",
        order: "desc",
        page: 1,
        pageSize: 25,
      });
      const chips = await screen.findByRole("list", { name: "Custom field filters" });
      expect(await within(chips).findByText("Region: North")).toBeInTheDocument();
      expect(within(chips).getByText("Team size: at least 10")).toBeInTheDocument();
    });

    it("applies a filter from the panel and reloads the list with it", async () => {
      const { user } = await renderLeads();

      await user.click(await screen.findByRole("button", { name: "More filters" }));
      const panel = await screen.findByRole("dialog", { name: "More filters" });
      await user.type(within(panel).getByLabelText("Preferred channel"), "email");
      await user.click(within(panel).getByRole("button", { name: "Apply filters" }));

      await waitFor(() => {
        expect(listLeads).toHaveBeenLastCalledWith({
          [`cf.${channelField.id}`]: "email",
          sort: "createdAt",
          order: "desc",
          page: 1,
          pageSize: 25,
        });
      });
      expect(mockRouter.replace).toHaveBeenLastCalledWith(`/leads?cf.${channelField.id}=email`, {
        scroll: false,
      });
    });

    it("says which custom filter the API refused, keeps the page working, and removes it", async () => {
      const refused: ApiError = {
        code: "VALIDATION_FAILED",
        message: "Invalid",
        details: [{ path: teamMin, message: "Must be a number" }],
      };
      vi.mocked(listLeads).mockRejectedValueOnce(refused);
      setMockLocation("/leads", `${teamMin}=abc`);
      const { user } = renderWithStore(<LeadsPage />, { me: adminUser });

      const alert = await screen.findByText(/could not be filtered by its custom fields/);
      const box = alert.closest('[role="alert"]') as HTMLElement;
      expect(box).toHaveTextContent("Team size: Must be a number");
      // The rest of the page is still there.
      expect(screen.getByRole("heading", { level: 1, name: "Leads" })).toBeInTheDocument();
      expect(screen.getByRole("searchbox")).toBeInTheDocument();

      await user.click(within(box).getByRole("button", { name: "Remove this filter" }));

      expect(await screen.findByRole("table", { name: "Leads" })).toBeInTheDocument();
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads", { scroll: false });
    });

    it("exports exactly what the search, the filters and the sort show", async () => {
      vi.mocked(exportLeads).mockResolvedValue({
        blob: new Blob(["x"]),
        filename: "leads-2026-10-10.csv",
        truncated: false,
      });
      const { user } = await renderLeads(
        adminUser,
        `search=acme&status=NEW&${region}=North&sort=name&order=asc&page=2`,
      );

      await user.click(screen.getByRole("button", { name: "Export CSV" }));

      await waitFor(() => {
        expect(exportLeads).toHaveBeenCalledWith({
          search: "acme",
          status: "NEW",
          [region]: "North",
          sort: "name",
          order: "asc",
          page: 2,
          pageSize: 25,
        });
      });
      await waitFor(() => {
        expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "leads-2026-10-10.csv");
      });
    });

    it("warns when the export was cut off at the row limit", async () => {
      vi.mocked(exportLeads).mockResolvedValue({
        blob: new Blob(["x"]),
        filename: "leads.csv",
        truncated: true,
      });
      const { user } = await renderLeads();

      await user.click(screen.getByRole("button", { name: "Export CSV" }));

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/first 10,000 rows/));
      });
    });

    it("offers Export to every role, and Import to every role but Read-only", async () => {
      for (const me of [adminUser, managerUser, repUser]) {
        const { unmount } = await renderLeads(me);
        expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute(
          "href",
          "/import?type=leads",
        );
        unmount();
      }

      await renderLeads(readOnlyUser);
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
    });
  });

  describe("the record page", () => {
    async function renderLead(lead: Lead) {
      vi.mocked(getLead).mockResolvedValue(lead);
      setMockLocation(`/leads/${lead.id}`);
      const view = renderWithStore(<LeadDetailPage id={lead.id} />, { me: adminUser });
      await screen.findByRole("heading", { level: 1, name: lead.name });
      return view;
    }
    const value = (label: string) => screen.getByText(label).nextElementSibling;

    it("shows every custom field with the lead's value, or the empty marker", async () => {
      await renderLead(marcusWithFields);

      expect(await screen.findByText("Custom fields")).toBeInTheDocument();
      expect(value("Region")).toHaveTextContent("North");
      expect(value("Team size")).toHaveTextContent("40");
      expect(value("Renewal date")).toHaveTextContent("Nov 15, 2026");
      expect(value("Preferred channel")).toHaveTextContent("—");
    });

    it("has no Custom fields card when leads have no custom fields", async () => {
      vi.mocked(listCustomFields).mockResolvedValue([]);
      await renderLead(marcus);

      await waitFor(() => {
        expect(listCustomFields).toHaveBeenCalledWith("LEAD");
      });
      expect(screen.queryByText("Custom fields")).not.toBeInTheDocument();
    });
  });

  describe("the forms", () => {
    it("creates a lead with its custom fields", async () => {
      vi.mocked(createLead).mockResolvedValue({ ...marcus, id: "new-lead" });
      setMockLocation("/leads/new");
      const { user } = renderWithStore(<NewLeadPage />, { me: repUser });
      await screen.findByRole("group", { name: "Custom fields" });

      await user.type(screen.getByLabelText("First name"), "Marcus");
      await user.type(screen.getByLabelText("Last name"), "Chen");
      await user.click(screen.getByRole("combobox", { name: "Region" }));
      await user.click(await screen.findByRole("option", { name: "South" }));
      await user.type(screen.getByLabelText("Team size"), "12");
      await user.click(screen.getByRole("button", { name: "Create lead" }));

      await waitFor(() => {
        expect(createLead).toHaveBeenCalledWith(
          expect.objectContaining({
            firstName: "Marcus",
            lastName: "Chen",
            customFields: { [regionField.id]: "South", [teamSizeField.id]: 12 },
          }),
        );
      });
    });

    it("does not create a lead without its required custom field", async () => {
      setMockLocation("/leads/new");
      const { user } = renderWithStore(<NewLeadPage />, { me: repUser });
      await screen.findByRole("group", { name: "Custom fields" });

      await user.type(screen.getByLabelText("First name"), "Marcus");
      await user.type(screen.getByLabelText("Last name"), "Chen");
      await user.click(screen.getByRole("button", { name: "Create lead" }));

      expect(await screen.findByText("Choose an option.")).toBeInTheDocument();
      expect(createLead).not.toHaveBeenCalled();
    });

    it("has no Custom fields section when leads have none, and sends none", async () => {
      vi.mocked(listCustomFields).mockResolvedValue([]);
      vi.mocked(createLead).mockResolvedValue({ ...marcus, id: "new-lead" });
      setMockLocation("/leads/new");
      const { user } = renderWithStore(<NewLeadPage />, { me: repUser });
      await screen.findByLabelText("First name");

      expect(screen.queryByRole("group", { name: "Custom fields" })).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("First name"), "Marcus");
      await user.type(screen.getByLabelText("Last name"), "Chen");
      await user.click(screen.getByRole("button", { name: "Create lead" }));

      await waitFor(() => {
        expect(createLead).toHaveBeenCalledTimes(1);
      });
      expect(vi.mocked(createLead).mock.calls[0]?.[0]).not.toHaveProperty("customFields");
    });

    it("still offers the form when the custom fields cannot be loaded", async () => {
      vi.mocked(listCustomFields).mockRejectedValue({
        code: "NETWORK_ERROR",
        message: "x",
        details: null,
      } satisfies ApiError);
      setMockLocation("/leads/new");
      renderWithStore(<NewLeadPage />, { me: repUser });

      expect(await screen.findByLabelText("First name")).toBeInTheDocument();
    });

    async function renderEdit(lead: Lead) {
      vi.mocked(getLead).mockResolvedValue(lead);
      setMockLocation(`/leads/${lead.id}/edit`);
      const view = renderWithStore(<EditLeadPage id={lead.id} />, { me: adminUser });
      await screen.findByRole("group", { name: "Custom fields" });
      return view;
    }

    it("edits a lead sending only the custom fields that changed", async () => {
      vi.mocked(updateLead).mockResolvedValue(marcusWithFields);
      const { user } = await renderEdit(marcusWithFields);

      expect(screen.getByLabelText("Team size")).toHaveValue("40");
      await user.clear(screen.getByLabelText("Team size"));
      await user.type(screen.getByLabelText("Team size"), "45");
      await user.type(screen.getByLabelText("Preferred channel"), "Email");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => {
        expect(updateLead).toHaveBeenCalledWith(marcus.id, {
          customFields: { [teamSizeField.id]: 45, [channelField.id]: "Email" },
        });
      });
    });

    it("puts the API's custom field errors on their fields", async () => {
      vi.mocked(updateLead).mockRejectedValue({
        code: "VALIDATION_FAILED",
        message: "Invalid",
        details: [
          { path: `customFields.${renewalField.id}`, message: "That day does not exist" },
          { path: "email", message: "Enter a valid email" },
        ],
      } satisfies ApiError);
      const { user } = await renderEdit(marcusWithFields);

      await user.type(screen.getByLabelText("Preferred channel"), "Email");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("That day does not exist")).toBeInTheDocument();
      expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
      expect(screen.getByLabelText("Renewal date")).toHaveAttribute("aria-invalid", "true");
    });
  });
});
