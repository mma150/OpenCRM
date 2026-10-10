import {
  Building2,
  CircleDollarSign,
  Contact,
  Funnel,
  History,
  House,
  Kanban,
  type LucideIcon,
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
  // "settings" pins the item to the bottom of the sidebar, under Settings.
  group?: "settings";
};

// The single list of destinations. The sidebar, the bottom tab bar, the "More" menu and the
// top bar title are all drawn from it: a new module adds ONE line here and nothing else.
export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: House, bottomTab: true },
  { href: "/leads", label: "Leads", icon: Funnel, bottomTab: true },
  // The pipeline is daily work, so it has a tab on phones. Profile gave up its tab for it:
  // it is one tap away in the top bar's user menu, and under "More".
  { href: "/opportunities", label: "Opportunities", icon: CircleDollarSign, bottomTab: true },
  { href: "/contacts", label: "Contacts", icon: Contact, bottomTab: false },
  { href: "/companies", label: "Companies", icon: Building2, bottomTab: false },
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
  },
  {
    href: "/settings/pipeline",
    label: "Pipeline",
    icon: Kanban,
    roles: ["ADMIN"],
    bottomTab: false,
    group: "settings",
  },
];

export function navItemsFor(role: Role): NavItem[] {
  return navItems.filter((item) => !item.roles || item.roles.includes(role));
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
    return "OpenCRM";
  }
  return item.group === "settings" ? `Settings / ${item.label}` : item.label;
}
