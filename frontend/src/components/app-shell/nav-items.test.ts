import { describe, expect, it } from "vitest";

import { isActive, navItems, navItemsFor, pageTitle } from "./nav-items";

describe("nav items", () => {
  it("shows Users and Pipeline to an Admin only, and Activity to an Admin and a Sales Manager", () => {
    expect(navItemsFor("ADMIN").map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Opportunities",
      "Contacts",
      "Companies",
      "Activity",
      "Profile",
      "Users",
      "Pipeline",
    ]);
    expect(navItemsFor("SALES_MANAGER").map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Opportunities",
      "Contacts",
      "Companies",
      "Activity",
      "Profile",
    ]);
    for (const role of ["SALES_REP", "READ_ONLY"] as const) {
      expect(navItemsFor(role).map((item) => item.label)).toEqual([
        "Home",
        "Leads",
        "Opportunities",
        "Contacts",
        "Companies",
        "Profile",
      ]);
    }
  });

  it("shows Opportunities to every role, and the pipeline settings under Settings", () => {
    const opportunities = navItems.find((item) => item.href === "/opportunities");
    expect(opportunities?.roles).toBeUndefined();
    const pipeline = navItems.find((item) => item.href === "/settings/pipeline");
    expect(pipeline?.roles).toEqual(["ADMIN"]);
    expect(pipeline?.group).toBe("settings");
    expect(pipeline?.bottomTab).toBe(false);
  });

  it("shows Contacts and Companies to every role, under More on phones", () => {
    for (const href of ["/contacts", "/companies"]) {
      const item = navItems.find((candidate) => candidate.href === href);
      expect(item?.roles).toBeUndefined();
      expect(item?.bottomTab).toBe(false);
    }
  });

  it("lists Activity under More on phones", () => {
    const activity = navItems.find((item) => item.href === "/activity");
    expect(activity?.bottomTab).toBe(false);
  });

  it("keeps the phone tab bar to three tabs plus More", () => {
    expect(navItems.filter((item) => item.bottomTab).length).toBeLessThanOrEqual(3);
  });

  it("marks Home active only on /, and other items on their own pages and below", () => {
    const home = navItems.find((item) => item.href === "/");
    const profile = navItems.find((item) => item.href === "/profile");
    expect(home && isActive(home, "/")).toBe(true);
    expect(home && isActive(home, "/profile")).toBe(false);
    expect(profile && isActive(profile, "/profile")).toBe(true);
    expect(profile && isActive(profile, "/profile/security")).toBe(true);
    expect(profile && isActive(profile, "/profiles")).toBe(false);
  });

  it("puts Home, Leads and Opportunities in the phone tab bar, in that order", () => {
    expect(navItems.filter((item) => item.bottomTab).map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Opportunities",
    ]);
  });

  it("lists Profile under More on phones", () => {
    const profile = navItems.find((item) => item.href === "/profile");
    expect(profile?.bottomTab).toBe(false);
  });

  it("names the page for the top bar", () => {
    expect(pageTitle("/")).toBe("Home");
    expect(pageTitle("/leads")).toBe("Leads");
    expect(pageTitle("/leads/123/edit")).toBe("Leads");
    expect(pageTitle("/contacts/123")).toBe("Contacts");
    expect(pageTitle("/companies/123/edit")).toBe("Companies");
    expect(pageTitle("/activity")).toBe("Activity");
    expect(pageTitle("/opportunities/123")).toBe("Opportunities");
    expect(pageTitle("/settings/users")).toBe("Settings / Users");
    expect(pageTitle("/settings/pipeline")).toBe("Settings / Pipeline");
    expect(pageTitle("/somewhere-else")).toBe("OpenCRM");
  });
});
