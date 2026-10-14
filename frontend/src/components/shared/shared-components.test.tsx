import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RoleBadge, StatusBadge } from "./badges";
import { CopyLinkField } from "./copy-link-field";
import { NotFoundPage } from "./not-found-page";
import { PageHeader } from "./page-header";
import { PageLoading, PageState } from "./page-state";
import { PasswordInput } from "./password-input";
import { RecordHeader, RecordLayout } from "./record-layout";
import { SegmentedControl } from "./segmented-control";

describe("PageHeader", () => {
  it("renders the page title as the h1, with its description and action", () => {
    render(
      <PageHeader
        title="Users"
        description="Invite people."
        action={<button type="button">Invite user</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Users" })).toBeInTheDocument();
    expect(screen.getByText("Invite people.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite user" })).toBeInTheDocument();
  });
});

describe("PageState", () => {
  it("shows a title, a description and an action", () => {
    render(
      <PageState
        title="You do not have access"
        description="Ask an Admin."
        action={<button type="button">Back to Home</button>}
      />,
    );

    expect(screen.getByText("You do not have access")).toBeInTheDocument();
    expect(screen.getByText("Ask an Admin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Home" })).toBeInTheDocument();
  });

  it("announces loading", () => {
    render(<PageLoading label="Checking your invite..." />);

    expect(screen.getByText("Checking your invite...")).toBeInTheDocument();
  });
});

describe("NotFoundPage", () => {
  // An unknown address showed the framework's bare 404 with no way back into the app.
  it("says the page was not found and links back to Home", () => {
    render(<NotFoundPage />);

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  });
});

describe("PasswordInput", () => {
  it("hides the password until Show is pressed, and hides it again", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" autoComplete="current-password" />);
    const input = screen.getByLabelText("Password");

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("badges", () => {
  it("shows roles and statuses as words", () => {
    render(
      <>
        <RoleBadge role="SALES_MANAGER" />
        <RoleBadge role="READ_ONLY" />
        <StatusBadge status="INVITED" />
        <StatusBadge status="DEACTIVATED" />
      </>,
    );

    for (const label of ["Sales Manager", "Read-only", "Invited", "Deactivated"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("CopyLinkField", () => {
  const link = "http://localhost:3000/accept-invite?token=abc";

  it("shows the whole link in a read-only box", () => {
    render(<CopyLinkField label="Invite link" link={link} />);

    const input = screen.getByRole("textbox", { name: "Invite link" });
    expect(input).toHaveValue(link);
    expect(input).toHaveAttribute("readonly");
  });

  it("copies the link and says so", async () => {
    // userEvent.setup() installs a clipboard on navigator, so set it up before spying.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyLinkField label="Invite link" link={link} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(link);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("shows the choices as buttons, says which is on and reports a new one", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        label="Filter timeline"
        value="ALL"
        options={[
          { value: "ALL", label: "All" },
          { value: "NOTE", label: "Notes" },
        ]}
        onChange={onChange}
      />,
    );

    const group = screen.getByRole("group", { name: "Filter timeline" });
    expect(group).toHaveClass("min-w-0");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(onChange).toHaveBeenCalledWith("NOTE");
  });
});

describe("RecordHeader", () => {
  // A long name beside five actions on a tablet was squeezed to one letter per line: the
  // name keeps at least 16rem and the actions wrap under it instead.
  it("keeps room for the name and lets the actions wrap below it", () => {
    render(
      <RecordHeader
        title="Northwind Logistics - Driver App"
        actions={<button type="button">Close as won</button>}
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Northwind Logistics - Driver App",
    });
    const titleColumn = heading.closest("[data-slot=record-title]");
    expect(titleColumn).toHaveClass("md:min-w-64", "md:flex-1");
    expect(titleColumn?.parentElement).toHaveClass("md:flex-wrap");
  });
});

describe("RecordLayout", () => {
  it("puts both columns side by side from lg, and one at a time below it", async () => {
    const user = userEvent.setup();
    render(
      <RecordLayout
        header={<h1>Marcus Chen</h1>}
        main={<p>the timeline</p>}
        aside={<p>the details</p>}
      />,
    );
    const main = screen.getByText("the timeline").parentElement;
    const aside = screen.getByText("the details").parentElement;

    expect(main?.parentElement).toHaveClass("grid", "lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(aside).toHaveClass("lg:order-last", "max-lg:hidden");
    expect(main).not.toHaveClass("max-lg:hidden");
    // The switch is for the narrow layout only.
    expect(screen.getByRole("group", { name: "Section" })).toHaveClass("lg:hidden");

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(aside).not.toHaveClass("max-lg:hidden");
    expect(main).toHaveClass("max-lg:hidden");

    await user.click(screen.getByRole("button", { name: "Timeline" }));
    expect(main).not.toHaveClass("max-lg:hidden");
  });

  it("gives an extra section its own button below lg, and puts it above the main column", async () => {
    const user = userEvent.setup();
    render(
      <RecordLayout
        header={<h1>Northwind</h1>}
        main={<p>the timeline</p>}
        aside={<p>the details</p>}
        extra={{ label: "Contacts", content: <p>the contacts</p> }}
      />,
    );
    const main = screen.getByText("the timeline").parentElement;
    const extra = screen.getByText("the contacts").parentElement;
    const aside = screen.getByText("the details").parentElement;
    const buttons = within(screen.getByRole("group", { name: "Section" })).getAllByRole("button");

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Timeline",
      "Contacts",
      "Details",
    ]);
    // From lg both sit in the wide column, the extra section first.
    expect(extra?.parentElement).toBe(main?.parentElement);
    expect(extra?.nextElementSibling).toBe(main);
    expect(extra).toHaveClass("max-lg:hidden");
    expect(main).not.toHaveClass("max-lg:hidden");

    await user.click(screen.getByRole("button", { name: "Contacts" }));
    expect(extra).not.toHaveClass("max-lg:hidden");
    expect(main).toHaveClass("max-lg:hidden");
    expect(aside).toHaveClass("max-lg:hidden");

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(aside).not.toHaveClass("max-lg:hidden");
    expect(main?.parentElement).toHaveClass("max-lg:hidden");
  });

  it("names the two columns as the page asks", () => {
    render(
      <RecordLayout header={null} main={null} aside={null} mainLabel="History" asideLabel="Info" />,
    );

    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Info" })).toBeInTheDocument();
  });
});
