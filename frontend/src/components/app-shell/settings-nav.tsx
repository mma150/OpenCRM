"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { selectAuth } from "@/features/auth/auth.slice";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/store/hooks";

import { isActive, type NavItem, navItemsFor, SETTINGS_HREF, settingsItemsOf } from "./nav-items";

// The Settings pages the signed-in user may open, from the one nav config.
function useSettingsItems(): NavItem[] {
  const { data: me } = useAppSelector(selectAuth);
  return me ? settingsItemsOf(navItemsFor(me.role)) : [];
}

// The frame around every page under /settings (its route layout renders this).
//   from `md`: a row of tabs above the page, one per settings page the role may open; the
//              row wraps onto a second line on a tablet instead of scrolling
//   phone:     a "Settings" link back to the list at /settings, which is the navigation
// The list page itself (/settings) gets neither.
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const items = useSettingsItems();

  if (pathname === SETTINGS_HREF) {
    return <>{children}</>;
  }

  return (
    <>
      <Link
        href={SETTINGS_HREF}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-2 flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm outline-none focus-visible:ring-3 md:hidden"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Settings
      </Link>
      <nav aria-label="Settings" className="hidden border-b md:block">
        <ul className="flex flex-wrap gap-x-1">
          {items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 -mb-px flex h-10 items-center rounded-t-md border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-3",
                    active
                      ? "border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </>
  );
}

// /settings: the list of settings pages the role may open. On a phone this is how a
// settings page is reached ("More", then "Settings").
export function SettingsOverview() {
  const items = useSettingsItems();

  return (
    <>
      <PageHeader title="Settings" description="How this installation of OpenCRM is set up." />
      <nav aria-label="Settings">
        <ul className="bg-card flex flex-col divide-y rounded-lg border">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-h-16 min-w-0 items-center gap-3 rounded-lg p-4 outline-none focus-visible:ring-3"
                >
                  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.description ? (
                      <span className="text-muted-foreground text-sm">{item.description}</span>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
