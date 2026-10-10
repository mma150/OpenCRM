import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { exportCompanies, listCompanies, listIndustries } from "@/features/companies/companies.api";
import { companyList } from "@/features/companies/companies.fixtures";
import { CompaniesPage } from "@/features/companies/companies-page";
import { exportContacts, listContacts } from "@/features/contacts/contacts.api";
import { contactList } from "@/features/contacts/contacts.fixtures";
import { ContactsPage } from "@/features/contacts/contacts-page";
import { listCustomFields } from "@/features/custom-fields/custom-fields.api";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import {
  exportOpportunities,
  getBoard,
  listOpportunities,
} from "@/features/opportunities/opportunities.api";
import { board, opportunityList } from "@/features/opportunities/opportunities.fixtures";
import { OpportunitiesPage } from "@/features/opportunities/opportunities-page";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import { pipeline } from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { exportTasks, listTasks } from "@/features/tasks/tasks.api";
import { answerWith, groups } from "@/features/tasks/tasks.fixtures";
import { TasksPage } from "@/features/tasks/tasks-page";
import { listAssignableUsers } from "@/features/users/users.api";
import type { DownloadedFile } from "@/lib/api/download";
import { followNavigation, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

vi.mock("@/features/companies/companies.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/leads/leads.api");
vi.mock("@/lib/save-file");
vi.mock("sonner");

const file: DownloadedFile = { blob: new Blob(["x"]), filename: "list.csv", truncated: false };
const everyRole: Me[] = [adminUser, managerUser, repUser, readOnlyUser];
// A custom field filter in the address: it must reach the list, the board and the export.
const CUSTOM = "cf.abc";

async function clickExport(user: ReturnType<typeof renderWithStore>["user"]) {
  await user.click(await screen.findByRole("button", { name: "Export CSV" }));
}

// The export and import actions on the lists other than leads (which has its own tests in
// leads-custom-fields.test.tsx): who is offered what, and that an export is sent the same
// query as the list on screen.
describe("export and import on the list pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listContacts).mockResolvedValue(contactList());
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(listIndustries).mockResolvedValue([]);
    vi.mocked(listOpportunities).mockResolvedValue(opportunityList());
    vi.mocked(getBoard).mockResolvedValue(board());
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    for (const exportList of [exportContacts, exportCompanies, exportOpportunities, exportTasks]) {
      vi.mocked(exportList).mockResolvedValue(file);
    }
    followNavigation();
  });

  it("exports the contacts with the list's own query, custom filters included", async () => {
    setMockLocation("/contacts", `search=chen&${CUSTOM}=north&sort=createdAt&order=desc`);
    const { user } = renderWithStore(<ContactsPage />, { me: adminUser });

    await clickExport(user);

    await waitFor(() => {
      expect(exportContacts).toHaveBeenCalledTimes(1);
    });
    expect(listCustomFields).toHaveBeenCalledWith("CONTACT");
    expect(vi.mocked(exportContacts).mock.calls[0]?.[0]).toEqual(
      vi.mocked(listContacts).mock.lastCall?.[0],
    );
    expect(vi.mocked(exportContacts).mock.calls[0]?.[0]).toMatchObject({
      search: "chen",
      [CUSTOM]: "north",
      sort: "createdAt",
      order: "desc",
    });
  });

  it("exports the companies with the list's own query, custom filters included", async () => {
    setMockLocation("/companies", `industry=Logistics&${CUSTOM}.min=5`);
    const { user } = renderWithStore(<CompaniesPage />, { me: adminUser });

    await clickExport(user);

    await waitFor(() => {
      expect(exportCompanies).toHaveBeenCalledTimes(1);
    });
    expect(listCustomFields).toHaveBeenCalledWith("COMPANY");
    expect(vi.mocked(exportCompanies).mock.calls[0]?.[0]).toEqual(
      vi.mocked(listCompanies).mock.lastCall?.[0],
    );
    expect(vi.mocked(exportCompanies).mock.calls[0]?.[0]).toMatchObject({
      industry: "Logistics",
      [`${CUSTOM}.min`]: "5",
    });
  });

  it("offers Import on contacts and companies to every role but Read-only, Export to all", async () => {
    const pages = [
      { Page: ContactsPage, path: "/contacts", href: "/import?type=contacts" },
      { Page: CompaniesPage, path: "/companies", href: "/import?type=companies" },
    ];
    for (const { Page, path, href } of pages) {
      for (const me of everyRole) {
        setMockLocation(path);
        const { unmount } = renderWithStore(<Page />, { me });
        expect(await screen.findByRole("button", { name: "Export CSV" })).toBeInTheDocument();
        if (me.role === "READ_ONLY") {
          expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
        } else {
          expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("href", href);
        }
        unmount();
      }
    }
  });

  it("exports the opportunities from the list view, and sends custom filters to list and export", async () => {
    setMockLocation("/opportunities", `view=list&status=OPEN&${CUSTOM}=Renewal`);
    const { user } = renderWithStore(<OpportunitiesPage />, { me: readOnlyUser });

    await clickExport(user);

    await waitFor(() => {
      expect(exportOpportunities).toHaveBeenCalledTimes(1);
    });
    expect(listCustomFields).toHaveBeenCalledWith("OPPORTUNITY");
    expect(vi.mocked(exportOpportunities).mock.calls[0]?.[0]).toEqual(
      vi.mocked(listOpportunities).mock.lastCall?.[0],
    );
    expect(vi.mocked(listOpportunities).mock.lastCall?.[0]).toMatchObject({
      status: "OPEN",
      [CUSTOM]: "Renewal",
    });
    // Opportunities are not imported.
    expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
  });

  it("has no export on the board, but narrows the board by the custom filters", async () => {
    setMockLocation("/opportunities", `${CUSTOM}=Renewal&search=fleet`);
    renderWithStore(<OpportunitiesPage />, { me: adminUser });

    await waitFor(() => {
      expect(getBoard).toHaveBeenCalledWith({ search: "fleet", [CUSTOM]: "Renewal" });
    });
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
  });

  it("keeps the custom filters when the view changes", async () => {
    setMockLocation("/opportunities", `${CUSTOM}=Renewal`);
    const { user } = renderWithStore(<OpportunitiesPage />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "List" }));

    await waitFor(() => {
      expect(listOpportunities).toHaveBeenCalledWith(
        expect.objectContaining({ [CUSTOM]: "Renewal" }),
      );
    });
  });

  it("exports the open tasks that the search, the assignee and the Due filter show", async () => {
    setMockLocation("/tasks", "search=quote&due=overdue");
    const { user } = renderWithStore(<TasksPage />, { me: repUser });

    await clickExport(user);

    await waitFor(() => {
      expect(exportTasks).toHaveBeenCalledWith({
        status: "OPEN",
        search: "quote",
        assigneeId: repUser.id,
        due: "overdue",
        sort: "dueAt",
        order: "asc",
      });
    });
  });

  it("exports the Done view with its own query, for a Read-only user too", async () => {
    setMockLocation("/tasks", "view=done");
    const { user } = renderWithStore(<TasksPage />, { me: readOnlyUser });

    await clickExport(user);

    await waitFor(() => {
      expect(exportTasks).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(exportTasks).mock.calls[0]?.[0]).toMatchObject({
      status: "DONE",
      sort: "createdAt",
      order: "desc",
    });
    expect(vi.mocked(exportTasks).mock.calls[0]?.[0]).not.toHaveProperty("assigneeId");
  });
});
