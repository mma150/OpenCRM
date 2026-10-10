import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCompany, listCompanies } from "./companies.api";
import { brightpath, companyList, kestrel, northwind } from "./companies.fixtures";
import type { CompanyRef } from "./companies.types";
import { CompanyFilter, CompanyPicker } from "./company-picker";

vi.mock("./companies.api");

const pickerQuery = { sort: "name", order: "asc", page: 1, pageSize: 20 };

// The picker with the state a form would keep for it.
function Harness({ initial = null }: { initial?: CompanyRef | null }) {
  const [company, setCompany] = useState<CompanyRef | null>(initial);
  return (
    <>
      <CompanyPicker id="companyId" value={company} onChange={setCompany} />
      <output>{company ? company.id : "none"}</output>
    </>
  );
}

async function openPicker(initial: CompanyRef | null = null) {
  const user = userEvent.setup();
  render(<Harness initial={initial} />);
  await user.click(
    screen.getByRole("button", { name: initial ? `Company: ${initial.name}` : "Company: none" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Choose a company" });
  return { user, dialog };
}

describe("CompanyPicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCompanies).mockResolvedValue(companyList());
  });

  it("asks for nothing until it is opened, then lists the first companies by name", async () => {
    render(<Harness />);
    expect(listCompanies).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Company: none" })).toHaveTextContent(
      "Choose a company",
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Company: none" }));
    const list = await screen.findByRole("list", { name: "Companies" });

    expect(listCompanies).toHaveBeenCalledWith(pickerQuery);
    expect(within(list).getAllByRole("button")).toHaveLength(3);
  });

  it("searches once typing has paused, and picks the company that is chosen", async () => {
    const { user, dialog } = await openPicker();
    await within(dialog).findByRole("list", { name: "Companies" });
    vi.mocked(listCompanies).mockResolvedValue(companyList([northwind]));

    await user.type(within(dialog).getByRole("searchbox", { name: "Search companies" }), " north ");

    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({ ...pickerQuery, search: "north" });
    });
    // One request for the whole word, not one per key.
    expect(listCompanies).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);
    });
    await user.click(within(dialog).getByRole("button", { name: "Northwind Logistics" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(northwind.id);
    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
  });

  it("shows the current company, marks it in the list, and clears it", async () => {
    const { user, dialog } = await openPicker(kestrel);

    const current = await within(dialog).findByRole("button", { name: "Kestrel Robotics" });
    expect(current).toHaveAttribute("aria-current", "true");
    await user.click(within(dialog).getByRole("button", { name: "No company" }));

    expect(screen.getByRole("status")).toHaveTextContent("none");
    expect(screen.queryByRole("button", { name: "Clear company" })).not.toBeInTheDocument();
  });

  it("clears the company with the button beside it, without opening the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness initial={kestrel} />);

    await user.click(screen.getByRole("button", { name: "Clear company" }));

    expect(screen.getByRole("status")).toHaveTextContent("none");
    expect(listCompanies).not.toHaveBeenCalled();
  });

  it("offers no way to pick none when no company is picked", async () => {
    const { dialog } = await openPicker();

    await within(dialog).findByRole("list", { name: "Companies" });
    expect(within(dialog).queryByRole("button", { name: "No company" })).not.toBeInTheDocument();
  });

  it("says when nothing matches, and when there are no companies at all", async () => {
    vi.mocked(listCompanies).mockResolvedValue(companyList([]));
    const { user, dialog } = await openPicker();

    expect(await within(dialog).findByText("No companies yet.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("searchbox"), "zzz");
    expect(await within(dialog).findByText('No companies match "zzz".')).toBeInTheDocument();
  });

  it("says how many more there are and asks to narrow the list", async () => {
    vi.mocked(listCompanies).mockResolvedValue(companyList([brightpath, kestrel], { total: 134 }));
    const { dialog } = await openPicker();

    expect(
      await within(dialog).findByText("Showing 2 of 134. Type to narrow the list."),
    ).toBeInTheDocument();
  });

  it("explains a failed search and tries again", async () => {
    vi.mocked(listCompanies)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(companyList());
    const { user, dialog } = await openPicker();

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The server cannot be reached.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));

    expect(await within(dialog).findByRole("list", { name: "Companies" })).toBeInTheDocument();
  });

  it("carries the form field's error attributes on its button", () => {
    render(
      <CompanyPicker id="companyId" value={null} onChange={vi.fn()} invalid describedBy="e1" />,
    );

    const button = screen.getByRole("button", { name: "Company: none" });
    expect(button).toHaveAttribute("id", "companyId");
    expect(button).toHaveAttribute("aria-invalid", "true");
    expect(button).toHaveAttribute("aria-describedby", "e1");
  });

  it("stays inside a phone screen: capped, scrolling inside, long names wrap", async () => {
    const { dialog } = await openPicker();

    expect(dialog).toHaveClass("max-h-[90dvh]", "overflow-y-auto");
    const row = await within(dialog).findByRole("button", { name: "Northwind Logistics" });
    expect(within(row).getByText("Northwind Logistics")).toHaveClass("min-w-0", "wrap-anywhere");
  });
});

describe("CompanyFilter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCompanies).mockResolvedValue(companyList());
  });

  it("reads 'All' when the filter is off and asks the API nothing", () => {
    render(<CompanyFilter companyId="" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent("Company:All");
    expect(getCompany).not.toHaveBeenCalled();
  });

  it("finds the name of a company that came from the address", async () => {
    vi.mocked(getCompany).mockResolvedValue(northwind);
    render(<CompanyFilter companyId={northwind.id} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent(
        "Company:Northwind Logistics",
      );
    });
    expect(getCompany).toHaveBeenCalledWith(northwind.id);
  });

  it("says so when that company cannot be loaded", async () => {
    vi.mocked(getCompany).mockRejectedValue({ code: "NOT_FOUND", message: "x", details: null });
    render(<CompanyFilter companyId={northwind.id} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent("Unknown company");
    });
  });

  it("reports the id of the company that is picked, and '' for all companies", async () => {
    const onChange = vi.fn();
    // The filter with the state a list page keeps for it in the address.
    function Page() {
      const [companyId, setCompanyId] = useState("");
      return (
        <CompanyFilter
          companyId={companyId}
          onChange={(next) => {
            onChange(next);
            setCompanyId(next);
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Company" }));
    await user.click(await screen.findByRole("button", { name: "Kestrel Robotics" }));
    expect(onChange).toHaveBeenLastCalledWith(kestrel.id);
    // The name is known from the pick, so it is not asked for again.
    expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent(
      "Company:Kestrel Robotics",
    );
    expect(getCompany).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Company" }));
    await user.click(await screen.findByRole("button", { name: "All companies" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent("Company:All");
  });
});
