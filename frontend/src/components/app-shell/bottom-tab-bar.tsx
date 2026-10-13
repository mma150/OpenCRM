"use client";

import { Ellipsis, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  isActive,
  isSettingsPath,
  mainItemsOf,
  type NavItem,
  SETTINGS_HREF,
  settingsItemsOf,
} from "./nav-items";
import { ThemeMenuItems } from "./theme-menu-items";

// Every tab and menu row is at least 44px tall, so it is easy to hit with a thumb.
const tabClass =
  "focus-visible:ring-ring/50 flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 text-xs font-medium outline-none focus-visible:ring-3";
const menuRowClass = "min-h-11 gap-3 px-3";

// Phone navigation (D-13): fixed tabs for the most used sections plus "More", which holds
// every other destination, the theme switch and Log out.
export function BottomTabBar({ items, onLogout }: { items: NavItem[]; onLogout: () => void }) {
  const pathname = usePathname();
  const tabs = items.filter((item) => item.bottomTab);
  const moreItems = mainItemsOf(items).filter((item) => !item.bottomTab);
  // The Settings area is one row under "More": it opens the list of its pages.
  const hasSettings = settingsItemsOf(items).length > 0;
  const moreActive = moreItems.some((item) => isActive(item, pathname)) || isSettingsPath(pathname);

  return (
    <nav
      aria-label="Main"
      className="bg-background fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16">
        {tabs.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon aria-hidden className="size-5" />
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}

        <li className="min-w-0 flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(tabClass, moreActive ? "text-primary" : "text-muted-foreground")}
            >
              <Ellipsis aria-hidden className="size-5" />
              <span>More</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-64">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.href} asChild className={menuRowClass}>
                    <Link href={item.href}>
                      <Icon aria-hidden />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              {hasSettings ? (
                <DropdownMenuItem asChild className={menuRowClass}>
                  <Link href={SETTINGS_HREF}>
                    <Settings aria-hidden />
                    Settings
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {moreItems.length > 0 || hasSettings ? <DropdownMenuSeparator /> : null}
              <ThemeMenuItems itemClassName="min-h-11" />
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className={menuRowClass} onSelect={onLogout}>
                <LogOut aria-hidden />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  );
}
