import { describe, expect, it } from "vitest";

import {
  isActive,
  isSettingsPath,
  mainItemsOf,
  navItems,
  navItemsFor,
  pageTitle,
  settingsItemsOf,
} from "./nav-items";

describe("nav items", () => {
  it("shows Users and Pipeline to an Admin only, and Activity to every role but a Sales Rep", () => {
    expect(navItemsFor("ADMIN").map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Opportunities",
      "Tasks",
      "Contacts",
      "Companies",
      "Quotes",
      "Invoices",
      "Activity",
      "Profile",
      "Users",
      "Pipeline",
      "Custom fields",
      "Email",
      "Email templates",
      "Products",
      "Organization",
    ]);
    expect(navItemsFor("SALES_MANAGER").map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Opportunities",
      "Tasks",
      "Contacts",
      "Companies",
      "Quotes",
      "Invoices",
      "Activity",
      "Profile",
      "Email templates",
      "Products",
    ]);
    const forEveryone = [
      "Home",
      "Leads",
      "Opportunities",
      "Tasks",
      "Contacts",
      "Companies",
      "Quotes",
      "Invoices",
      "Profile",
    ];
    expect(navItemsFor("SALES_REP").map((item) => item.label)).toEqual([
      ...forEveryone,
      "Email templates",
      "Products",
    ]);
    // A Read-only user cannot send email, so templates are not offered; the catalog is. They
    // see every record, so they see the team's Activity as an Admin does.
    expect(navItemsFor("READ_ONLY").map((item) => item.label)).toEqual([
      ...forEveryone.slice(0, -1),
      "Activity",
      "Profile",
      "Products",
    ]);
  });

  it("splits the destinations into the main list and the Settings area", () => {
    const admin = navItemsFor("ADMIN");
    expect(mainItemsOf(admin).some((item) => item.group === "settings")).toBe(false);
    expect(settingsItemsOf(admin).map((item) => item.href)).toEqual([
      "/settings/users",
      "/settings/pipeline",
      "/settings/custom-fields",
      "/settings/email",
      "/settings/email-templates",
      "/settings/products",
      "/settings/organization",
    ]);
    expect(settingsItemsOf(navItemsFor("READ_ONLY")).map((item) => item.href)).toEqual([
      "/settings/products",
    ]);
    // Every settings page says what it is for on the list at /settings.
    expect(settingsItemsOf(admin).every((item) => item.description)).toBe(true);
    expect(isSettingsPath("/settings")).toBe(true);
    expect(isSettingsPath("/settings/email")).toBe(true);
    expect(isSettingsPath("/settingsx")).toBe(false);
  });

  it("shows Quotes and Invoices to every role, under More on phones", () => {
    for (const href of ["/quotes", "/invoices"]) {
      const item = navItems.find((candidate) => candidate.href === href);
      expect(item?.roles).toBeUndefined();
      expect(item?.bottomTab).toBe(false);
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

  it("puts Home, Leads and Tasks in the phone tab bar, in that order", () => {
    expect(navItems.filter((item) => item.bottomTab).map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Tasks",
    ]);
  });

  it("shows Tasks to every role, and lists Opportunities first under More on phones", () => {
    expect(navItems.find((item) => item.href === "/tasks")?.roles).toBeUndefined();
    expect(navItems.filter((item) => !item.bottomTab)[0]?.href).toBe("/opportunities");
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
    expect(pageTitle("/tasks")).toBe("Tasks");
    expect(pageTitle("/notifications")).toBe("Notifications");
    expect(pageTitle("/opportunities/123")).toBe("Opportunities");
    expect(pageTitle("/settings/users")).toBe("Settings / Users");
    expect(pageTitle("/settings/pipeline")).toBe("Settings / Pipeline");
    expect(pageTitle("/settings/custom-fields")).toBe("Settings / Custom fields");
    expect(pageTitle("/settings")).toBe("Settings");
    expect(pageTitle("/settings/email")).toBe("Settings / Email");
    expect(pageTitle("/settings/email-templates")).toBe("Settings / Email templates");
    expect(pageTitle("/quotes/123/edit")).toBe("Quotes");
    expect(pageTitle("/invoices/123")).toBe("Invoices");
    expect(pageTitle("/import")).toBe("Import");
    expect(pageTitle("/somewhere-else")).toBe("OpenCRM");
  });
});
