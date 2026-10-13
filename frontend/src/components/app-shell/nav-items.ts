import {
  Building2,
  CircleDollarSign,
  Contact,
  FileText,
  Funnel,
  History,
  House,
  Kanban,
  Landmark,
  ListChecks,
  type LucideIcon,
  Mail,
  MailPlus,
  Package,
  Receipt,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";

import type { Role } from "@/lib/user-labels";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Who sees the item. Leave out for everyone. The API enforces access; this only hides links.
  roles?: Role[];
  // true: a tab in the phone's bottom bar. false: listed under its "More" tab.
  // Keep to three tabs at most, so the bar is four with "More".
  bottomTab: boolean;
  // "settings": a page of the Settings area. The sidebar and the "More" menu show one
  // "Settings" link for all of them; the area's own navigation lists them (settings-nav.tsx).
  group?: "settings";
  // One line about a settings page, for the list at /settings.
  description?: string;
};

// Where the Settings area starts: the list of its pages.
export const SETTINGS_HREF = "/settings";

// The single list of destinations. The sidebar, the bottom tab bar, the "More" menu and the
// top bar title are all drawn from it: a new module adds ONE line here and nothing else.
export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: House, bottomTab: true },
  { href: "/leads", label: "Leads", icon: Funnel, bottomTab: true },
  // On phones the three tabs are the screens a sales person opens many times a day: Home (the
  // dashboard), Leads and Tasks. Opportunities gave up its tab for Tasks: it is the first
  // item under "More", and Home links to the pipeline stage by stage.
  { href: "/opportunities", label: "Opportunities", icon: CircleDollarSign, bottomTab: false },
  { href: "/tasks", label: "Tasks", icon: ListChecks, bottomTab: true },
  { href: "/contacts", label: "Contacts", icon: Contact, bottomTab: false },
  { href: "/companies", label: "Companies", icon: Building2, bottomTab: false },
  { href: "/quotes", label: "Quotes", icon: FileText, bottomTab: false },
  { href: "/invoices", label: "Invoices", icon: Receipt, bottomTab: false },
  {
    href: "/activity",
    label: "Activity",
    icon: History,
    roles: ["ADMIN", "SALES_MANAGER"],
    bottomTab: false,
  },
  { href: "/profile", label: "Profile", icon: User, bottomTab: false },
  {
    href: "/settings/users",
    label: "Users",
    icon: Users,
    roles: ["ADMIN"],
    bottomTab: false,
    group: "settings",
    description: "Invite people, set their roles and managers, and deactivate accounts.",
  },
  {
    href: "/settings/pipeline",
    label: "Pipeline",
    icon: Kanban,
    roles: ["ADMIN"],
    bottomTab: false,
    group: "settings",
    description: "The stages an opportunity moves through.",
  },
  {
    href: "/settings/custom-fields",
    label: "Custom fields",
    icon: SlidersHorizontal,
    roles: ["ADMIN"],
    bottomTab: false,
    group: "settings",
    description: "Your own fields on leads, contacts, companies and opportunities.",
  },
  {
    href: "/settings/email",
    label: "Email",
    icon: Mail,
    roles: ["ADMIN"],
    bottomTab: false,
    group: "settings",
    description: "The mail server that sends invites, reminders and your team's emails.",
  },
  {
    // Everyone who can send email has templates of their own; shared ones are listed too.
    href: "/settings/email-templates",
    label: "Email templates",
    icon: MailPlus,
    roles: ["ADMIN", "SALES_MANAGER", "SALES_REP"],
    bottomTab: false,
    group: "settings",
    description: "Reusable emails: your own, and the ones shared with everyone.",
  },
  {
    // The catalog is open to every role: it is what quotes are built from. Admins manage it.
    href: "/settings/products",
    label: "Products",
    icon: Package,
    bottomTab: false,
    group: "settings",
    description: "The product catalog that quote lines are picked from.",
  },
  {
    href: "/settings/organization",
    label: "Organization",
    icon: Landmark,
    roles: ["ADMIN"],
    bottomTab: false,
    group: "settings",
    description: "Your details on quotes and invoices, and the defaults of a new quote.",
  },
];

export function navItemsFor(role: Role): NavItem[] {
  return navItems.filter((item) => !item.roles || item.roles.includes(role));
}

// The destinations outside Settings: the sidebar's main list, the phone tabs and "More".
export function mainItemsOf(items: NavItem[]): NavItem[] {
  return items.filter((item) => item.group !== "settings");
}

// The pages of the Settings area a role may open (`items` is already `navItemsFor(role)`).
export function settingsItemsOf(items: NavItem[]): NavItem[] {
  return items.filter((item) => item.group === "settings");
}

export function isSettingsPath(pathname: string): boolean {
  return pathname === SETTINGS_HREF || pathname.startsWith(`${SETTINGS_HREF}/`);
}

// "/" matches only itself; any other item also matches the pages beneath it.
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") {
    return pathname === "/";
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// The top bar title for a path: "Home", or "Settings / Users" for a grouped item.
export function pageTitle(pathname: string): string {
  const item = navItems.find((candidate) => isActive(candidate, pathname));
  if (!item) {
    // The bell in the top bar leads to Notifications at every width, and the lists lead to
    // Import, so neither is a nav item.
    if (pathname === "/notifications") {
      return "Notifications";
    }
    if (pathname === SETTINGS_HREF) {
      return "Settings";
    }
    return pathname === "/import" ? "Import" : "OpenCRM";
  }
  return item.group === "settings" ? `Settings / ${item.label}` : item.label;
}
