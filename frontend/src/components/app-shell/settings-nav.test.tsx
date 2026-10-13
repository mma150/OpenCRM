import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { navItemsFor, settingsItemsOf } from "./nav-items";
import { SettingsFrame, SettingsOverview } from "./settings-nav";

const ALL = [
  "Users",
  "Pipeline",
  "Custom fields",
  "Email",
  "Email templates",
  "Products",
  "Organization",
];

// What each role may open under Settings.
const perRole: [string, Me, string[]][] = [
  ["an Admin", adminUser, ALL],
  ["a Sales Manager", managerUser, ["Email templates", "Products"]],
  ["a Sales Rep", repUser, ["Email templates", "Products"]],
  ["a Read-only user", readOnlyUser, ["Products"]],
];

function renderFrame(me: Me, pathname: string) {
  setMockLocation(pathname);
  return renderWithStore(
    <SettingsFrame>
      <p>The page</p>
    </SettingsFrame>,
    { me },
  );
}

const tabs = () =>
  within(screen.getByRole("navigation", { name: "Settings" })).getAllByRole("link");

describe("SettingsFrame", () => {
  it.each(perRole)("gives %s a tab for each settings page they may open", (_name, me, labels) => {
    renderFrame(me, "/settings/products");

    expect(tabs().map((tab) => tab.textContent)).toEqual(labels);
    // The tabs are the nav config's settings items for the role, in its order.
    expect(tabs().map((tab) => tab.getAttribute("href"))).toEqual(
      settingsItemsOf(navItemsFor(me.role)).map((item) => item.href),
    );
    expect(screen.getByText("The page")).toBeInTheDocument();
  });

  it("marks the tab of the page that is open, and only that one", () => {
    const { unmount } = renderFrame(adminUser, "/settings/products");
    expect(tabs().filter((tab) => tab.getAttribute("aria-current") === "page")).toEqual([
      screen.getByRole("link", { name: "Products" }),
    ]);
    unmount();

    // "Email" must not light up for "Email templates", whose address starts the same way.
    renderFrame(adminUser, "/settings/email-templates");
    expect(
      tabs()
        .filter((tab) => tab.getAttribute("aria-current") === "page")
        .map((tab) => tab.textContent),
    ).toEqual(["Email templates"]);
  });

  it("keeps a tab active on a page beneath it", () => {
    renderFrame(adminUser, "/settings/users/invite");

    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the tabs from `md` and, on a phone, a link back to the settings list instead", () => {
    renderFrame(adminUser, "/settings/pipeline");

    expect(screen.getByRole("navigation", { name: "Settings" })).toHaveClass("hidden", "md:block");
    // The tabs wrap onto another line on a tablet rather than scroll.
    expect(within(screen.getByRole("navigation")).getByRole("list")).toHaveClass("flex-wrap");

    const back = screen.getByRole("link", { name: "Settings" });
    expect(back).toHaveAttribute("href", "/settings");
    expect(back).toHaveClass("md:hidden");
    // Tall enough for a finger.
    expect(back).toHaveClass("min-h-11");
  });

  it("adds nothing around the settings list itself", () => {
    renderFrame(adminUser, "/settings");

    expect(screen.getByText("The page")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("draws no tabs while nobody is signed in", () => {
    setMockLocation("/settings/products");
    renderWithStore(
      <SettingsFrame>
        <p>The page</p>
      </SettingsFrame>,
    );

    expect(
      within(screen.getByRole("navigation", { name: "Settings" })).queryByRole("link"),
    ).not.toBeInTheDocument();
  });
});

describe("SettingsOverview", () => {
  it.each(perRole)("lists for %s the settings pages they may open", (_name, me, labels) => {
    setMockLocation("/settings");
    renderWithStore(<SettingsOverview />, { me });

    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    const links = within(screen.getByRole("navigation", { name: "Settings" })).getAllByRole("link");
    expect(links).toHaveLength(labels.length);
    const items = settingsItemsOf(navItemsFor(me.role));
    links.forEach((link, index) => {
      expect(link).toHaveAttribute("href", items[index]?.href);
      expect(link).toHaveTextContent(labels[index] ?? "");
      // Each page says in one line what it is for.
      expect(link).toHaveTextContent(items[index]?.description ?? "");
    });
  });

  it("gives a Read-only user the product catalog and nothing else", () => {
    setMockLocation("/settings");
    renderWithStore(<SettingsOverview />, { me: readOnlyUser });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/settings/products");
    expect(links[0]).toHaveTextContent(
      "ProductsThe product catalog that quote lines are picked from.",
    );
  });

  it("makes each row tall enough for a finger and lets long text shrink", () => {
    setMockLocation("/settings");
    renderWithStore(<SettingsOverview />, { me: adminUser });

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("min-h-16", "min-w-0");
    }
  });
});
