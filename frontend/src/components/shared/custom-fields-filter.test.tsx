import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  channelField,
  leadFields,
  regionField,
  renewalField,
  teamSizeField,
} from "@/features/custom-fields/custom-fields.fixtures";
import type { CustomField } from "@/features/custom-fields/custom-fields.types";
import type { ApiError } from "@/lib/api/http";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";

import { CustomFieldFilterButton, CustomFieldFilterChips } from "./custom-fields-filter";
import { type ListUrlConfig, useListUrlState } from "./list-url-state";

const config: ListUrlConfig<"status", "createdAt"> = {
  filters: { status: ["NEW"] },
  sorts: ["createdAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
  customFilters: true,
};

const region = `cf.${regionField.id}`;
const teamMin = `cf.${teamSizeField.id}.min`;
const teamMax = `cf.${teamSizeField.id}.max`;
const renewalFrom = `cf.${renewalField.id}.from`;
const renewalTo = `cf.${renewalField.id}.to`;
const channel = `cf.${channelField.id}`;

// A list page reduced to its custom filters: the state lives in the address, as on the
// leads, contacts, companies and opportunities pages.
function Harness({
  fields = leadFields,
  error = null,
}: {
  fields?: CustomField[] | null;
  error?: ApiError | null;
}) {
  const { state, isFiltered, setCustom, clearFilters } = useListUrlState(config);
  return (
    <>
      <CustomFieldFilterButton fields={fields ?? []} values={state.custom} onApply={setCustom} />
      <CustomFieldFilterChips
        fields={fields}
        values={state.custom}
        onChange={setCustom}
        error={error}
      />
      {/* Read by test id: an open dialog hides the rest of the page from role queries. */}
      <output data-testid="state">
        {JSON.stringify({ custom: state.custom, page: state.page, isFiltered })}
      </output>
      <button type="button" onClick={clearFilters}>
        clear list filters
      </button>
    </>
  );
}

type Shown = { custom: Record<string, string>; page: number; isFiltered: boolean };
const shown = () => JSON.parse(screen.getByTestId("state").textContent) as Shown;

function renderFilters(search = "", props: Parameters<typeof Harness>[0] = {}) {
  setMockLocation("/leads", search);
  followNavigation();
  const user = userEvent.setup();
  render(<Harness {...props} />);
  return user;
}

const chips = () =>
  within(screen.getByRole("list", { name: "Custom field filters" }))
    .getAllByRole("listitem")
    .map((chip) => chip.textContent);

describe("custom field filters", { timeout: 20_000 }, () => {
  it("offers no More filters button for a record type without custom fields", () => {
    renderFilters("", { fields: [] });

    expect(screen.queryByRole("button", { name: /More filters/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Custom field filters" })).not.toBeInTheDocument();
  });

  it("opens a panel with one control per field, by its type", async () => {
    const user = renderFilters();

    await user.click(screen.getByRole("button", { name: "More filters" }));
    const panel = await screen.findByRole("dialog", { name: "More filters" });

    expect(within(panel).getByRole("combobox", { name: "Region" })).toHaveTextContent("Any");
    expect(within(panel).getByLabelText("Team size: at least")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Team size: at most")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Renewal date: from")).toHaveAttribute("type", "date");
    expect(within(panel).getByLabelText("Renewal date: to")).toHaveAttribute("type", "date");
    expect(within(panel).getByLabelText("Preferred channel")).toHaveAttribute("maxlength", "100");
  });

  it("applies every filter in one step, in the address, back on page 1", async () => {
    const user = renderFilters("status=NEW&page=3");

    await user.click(screen.getByRole("button", { name: "More filters" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("combobox", { name: "Region" }));
    await user.click(await screen.findByRole("option", { name: "South" }));
    await user.type(within(panel).getByLabelText("Team size: at least"), "10");
    await user.type(within(panel).getByLabelText("Team size: at most"), "20");
    await user.type(within(panel).getByLabelText("Renewal date: from"), "2026-01-01");
    await user.type(within(panel).getByLabelText("Preferred channel"), " email ");
    await user.click(within(panel).getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual({
      custom: {
        [region]: "South",
        [teamMin]: "10",
        [teamMax]: "20",
        [renewalFrom]: "2026-01-01",
        [channel]: "email",
      },
      page: 1,
      isFiltered: true,
    });
    // The other filters of the list stay.
    const [href] = mockRouter.replace.mock.calls[0] as [string];
    expect(new URLSearchParams(href.split("?")[1]).get("status")).toBe("NEW");
    expect(screen.getByRole("button", { name: "More filters (4)" })).toBeInTheDocument();
  });

  it("reads the filters from the address and shows them as chips", () => {
    renderFilters(
      `${region}=North&${teamMin}=10&${renewalFrom}=2026-01-01&${renewalTo}=2026-12-31&${channel}=email`,
    );

    expect(chips()).toEqual([
      "Region: North",
      "Team size: at least 10",
      "Renewal date: Jan 1, 2026 to Dec 31, 2026",
      'Preferred channel contains "email"',
      "Clear all",
    ]);
    expect(shown().isFiltered).toBe(true);
  });

  it("words a range by the ends that are set", () => {
    renderFilters(`${teamMax}=20&${renewalTo}=2026-12-31`);
    expect(chips().slice(0, 2)).toEqual([
      "Team size: at most 20",
      "Renewal date: until Dec 31, 2026",
    ]);
  });

  it("starts the panel from what is set", async () => {
    const user = renderFilters(`${region}=North&${teamMin}=10`);

    await user.click(screen.getByRole("button", { name: "More filters (2)" }));
    const panel = await screen.findByRole("dialog");

    expect(within(panel).getByRole("combobox", { name: "Region" })).toHaveTextContent("North");
    expect(within(panel).getByLabelText("Team size: at least")).toHaveValue("10");
  });

  it("removes one field's filter with its chip, both ends of a range together", async () => {
    const user = renderFilters(`${region}=North&${teamMin}=10&${teamMax}=20`);

    await user.click(screen.getByRole("button", { name: "Remove filter: Team size: 10 to 20" }));

    expect(shown().custom).toEqual({ [region]: "North" });
    expect(chips()).toEqual(["Region: North", "Clear all"]);
  });

  it("clears every custom filter with Clear all, and with the list's own Clear filters", async () => {
    const user = renderFilters(`status=NEW&${region}=North&${teamMin}=10`);

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(shown().custom).toEqual({});
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?status=NEW", { scroll: false });
    expect(screen.queryByRole("list", { name: "Custom field filters" })).not.toBeInTheDocument();

    setMockLocation("/leads", `status=NEW&${region}=North`);
    await user.click(screen.getByRole("button", { name: "clear list filters" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads", { scroll: false });
  });

  it("clears the panel with its own Clear all, applied only on Apply", async () => {
    const user = renderFilters(`${region}=North`);

    await user.click(screen.getByRole("button", { name: "More filters (1)" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Clear all" }));
    expect(shown().custom).toEqual({ [region]: "North" });
    await user.click(within(panel).getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(shown().custom).toEqual({});
    });
  });

  it("refuses a number that is not one, and a range the wrong way round, without applying", async () => {
    const user = renderFilters();

    await user.click(screen.getByRole("button", { name: "More filters" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Team size: at least"), "lots");
    await user.click(within(panel).getByRole("button", { name: "Apply filters" }));
    expect(
      await within(panel).findByText("Enter a number such as 12 or 12.5."),
    ).toBeInTheDocument();

    await user.clear(within(panel).getByLabelText("Team size: at least"));
    await user.type(within(panel).getByLabelText("Team size: at least"), "30");
    await user.type(within(panel).getByLabelText("Team size: at most"), "20");
    await user.click(within(panel).getByRole("button", { name: "Apply filters" }));
    expect(await within(panel).findByText('"At most" is below "At least".')).toBeInTheDocument();

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(shown().custom).toEqual({});
  });

  it("leaves the filters alone when the panel is cancelled", async () => {
    const user = renderFilters(`${region}=North`);

    await user.click(screen.getByRole("button", { name: "More filters (1)" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Preferred channel"), "phone");
    await user.click(within(panel).getByRole("button", { name: "Cancel" }));

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(shown().custom).toEqual({ [region]: "North" });
  });

  it("shows a filter no field in use can take as a chip that can be removed", async () => {
    // An id that is not a field, and a form that does not fit the field's type.
    const user = renderFilters(`cf.gone=x&${region}.min=3&${region}=North`);

    expect(chips()).toEqual(["Region: North", "Filters not in use", "Clear all"]);
    await user.click(screen.getByRole("button", { name: "Remove filter: Filters not in use" }));

    expect(shown().custom).toEqual({ [region]: "North" });
  });

  it("does not call a filter unknown before the fields are loaded", () => {
    renderFilters(`${region}=North`, { fields: null });

    expect(chips()).toEqual(["Clear all"]);
  });

  it("names the filter the API refused and removes it on request", async () => {
    const error: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Invalid",
      details: [
        { path: teamMin, message: "Must be a number" },
        { path: "cf.gone", message: "Not a field in use" },
      ],
    };
    const user = renderFilters(`${region}=North&${teamMin}=abc&cf.gone=1`, { error });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Team size: Must be a number");
    expect(alert).toHaveTextContent("A filter in the address does not belong to a field in use.");
    expect(alert).not.toHaveTextContent("Not a field in use");

    await user.click(within(alert).getByRole("button", { name: "Remove these filters" }));

    expect(shown().custom).toEqual({ [region]: "North" });
  });

  it("says nothing about an error that is not about a custom filter", () => {
    const error: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Invalid",
      details: [{ path: "page", message: "Too small" }],
    };
    renderFilters(`${region}=North`, { error });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drops a cf parameter that is empty or longer than the API accepts", () => {
    setMockLocation("/leads", `${region}=&${channel}=${"x".repeat(101)}&${teamMin}=5`);
    render(<Harness />);

    expect(shown().custom).toEqual({ [teamMin]: "5" });
  });
});
