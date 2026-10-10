"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { isActive, type NavItem } from "./nav-items";
import { Wordmark } from "./wordmark";

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item, pathname);
  const Icon = item.icon;

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/50 flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-3 lg:justify-start",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className="truncate md:max-lg:sr-only">{item.label}</span>
          </Link>
        </TooltipTrigger>
        {/* The label is on screen from `lg` up, so the tooltip is for the icon-only width. */}
        <TooltipContent side="right" className="lg:hidden">
          {item.label}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

// Tablet and desktop navigation (D-13): icons with tooltips from `md`, full width from `lg`.
// Phones get BottomTabBar instead; there is no slide-in drawer.
export function AppSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const mainItems = items.filter((item) => !item.group);
  const settingsItems = items.filter((item) => item.group === "settings");

  return (
    <aside className="bg-sidebar sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r md:flex lg:w-60">
      <div className="flex h-14 shrink-0 items-center justify-center px-3 lg:justify-start lg:px-5">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3">
          <Wordmark collapsed />
        </Link>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {mainItems.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>

        {settingsItems.length > 0 ? (
          <div className="mt-auto flex flex-col gap-1 border-t pt-3">
            <p className="text-muted-foreground flex h-8 items-center justify-center gap-3 px-3 text-xs font-medium tracking-wide uppercase lg:justify-start">
              <Settings aria-hidden className="size-4 shrink-0 lg:hidden" />
              <span className="md:max-lg:sr-only">Settings</span>
            </p>
            <ul className="flex flex-col gap-1">
              {settingsItems.map((item) => (
                <SidebarLink key={item.href} item={item} pathname={pathname} />
              ))}
            </ul>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
