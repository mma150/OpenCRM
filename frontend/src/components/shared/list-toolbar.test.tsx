import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ListFilter, ListToolbar } from "./list-toolbar";

const statusFilter = (value: string, onChange = vi.fn()): ListFilter => ({
  label: "Status",
  allLabel: "All",
  value,
  options: [
    { value: "NEW", label: "New" },
    { value: "LOST", label: "Lost" },
  ],
  onChange,
});

function renderSearch(value: string, onChange: (value: string) => void) {
  const toolbar = (current: string) => (
    <ListToolbar search={{ value: current, placeholder: "Search leads", onChange }} />
  );
  const view = render(toolbar(value));
  return {
    box: screen.getByRole("searchbox", { name: "Search leads" }),
    // What the list does after a report: hand the new value back.
    setValue: (next: string) => {
      view.rerender(toolbar(next));
    },
  };
}

function type(box: HTMLElement, text: string) {
  fireEvent.change(box, { target: { value: text } });
}

describe("ListToolbar search", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the text once, after typing has paused", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { box } = renderSearch("", onChange);

    type(box, "a");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    type(box, "ac");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    type(box, "acme");
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("acme");
  });

  it("trims the text and does not report a change that is only spaces", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { box } = renderSearch("acme", onChange);

    type(box, "acme  ");
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not report text that was typed and deleted again before the pause", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { box } = renderSearch("", onChange);

    type(box, "a");
    type(box, "");
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a value that changed from outside, such as Clear filters", () => {
    const { box, setValue } = renderSearch("acme", vi.fn());
    expect(box).toHaveValue("acme");

    setValue("");

    expect(box).toHaveValue("");
  });

  it("keeps newer typing when the list catches up with an earlier report", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { box, setValue } = renderSearch("", onChange);

    type(box, "ac");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    type(box, "acme");
    // The list now answers the first report, while the user has typed on.
    setValue("ac");

    expect(box).toHaveValue("acme");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenLastCalledWith("acme");
  });

  it("limits the length when the list says how long a search may be", () => {
    render(
      <ListToolbar
        search={{ value: "", placeholder: "Search leads", maxLength: 100, onChange: vi.fn() }}
      />,
    );

    expect(screen.getByRole("searchbox")).toHaveAttribute("maxlength", "100");
  });
});

describe("ListToolbar filters and sort", () => {
  it("shows each filter with its label and the 'all' choice when it is off", () => {
    render(
      <ListToolbar
        search={{ value: "", placeholder: "Search", onChange: vi.fn() }}
        filters={[statusFilter("")]}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Status:All");
  });

  it("reports the chosen value, and '' when the filter is switched off", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <ListToolbar
        search={{ value: "", placeholder: "Search", onChange: vi.fn() }}
        filters={[statusFilter("", onChange)]}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Lost" }));
    expect(onChange).toHaveBeenLastCalledWith("LOST");

    view.rerender(
      <ListToolbar
        search={{ value: "", placeholder: "Search", onChange: vi.fn() }}
        filters={[statusFilter("LOST", onChange)]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Status:Lost");

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("offers the sort choices and reports the one picked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ListToolbar
        search={{ value: "", placeholder: "Search", onChange: vi.fn() }}
        sort={{
          value: "createdAt:desc",
          options: [
            { value: "createdAt:desc", label: "Newest first" },
            { value: "name:asc", label: "Name A–Z" },
          ],
          onChange,
        }}
      />,
    );

    const sort = screen.getByRole("combobox", { name: "Sort" });
    expect(sort).toHaveTextContent("Sort:Newest first");
    await user.click(sort);
    await user.click(screen.getByRole("option", { name: "Name A–Z" }));

    expect(onChange).toHaveBeenCalledWith("name:asc");
  });

  it("keeps the selects usable on a phone: two to a row, never wider than the page", () => {
    render(
      <ListToolbar
        search={{ value: "", placeholder: "Search", onChange: vi.fn() }}
        filters={[statusFilter("")]}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toHaveClass("w-full", "min-w-0");
    expect(trigger.parentElement).toHaveClass("grid", "grid-cols-2", "sm:flex", "sm:flex-wrap");
  });
});

describe("ListToolbar without a search box", () => {
  it("shows the filters alone", () => {
    render(<ListToolbar filters={[statusFilter("")]} />);

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Status:All");
  });
});
