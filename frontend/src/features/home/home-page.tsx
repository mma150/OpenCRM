"use client";

import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Contact,
  Funnel,
  History,
  Kanban,
  type LucideIcon,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";

import { RoleBadge } from "@/components/shared/badges";
import { selectAuth } from "@/features/auth/auth.slice";
import { useAppSelector } from "@/store/hooks";

type Shortcut = { href: string; title: string; description: string; icon: LucideIcon };

const leadsShortcut: Shortcut = {
  href: "/leads",
  title: "Leads",
  description: "Track every lead and what happens next.",
  icon: Funnel,
};
const opportunitiesShortcut: Shortcut = {
  href: "/opportunities",
  title: "Opportunities",
  description: "Your pipeline, stage by stage.",
  icon: CircleDollarSign,
};
const contactsShortcut: Shortcut = {
  href: "/contacts",
  title: "Contacts",
  description: "The people you deal with and what was said.",
  icon: Contact,
};
const companiesShortcut: Shortcut = {
  href: "/companies",
  title: "Companies",
  description: "The organisations your contacts work for.",
  icon: Building2,
};
const activityShortcut: Shortcut = {
  href: "/activity",
  title: "Activity",
  description: "What your team did and when.",
  icon: History,
};
const profileShortcut: Shortcut = {
  href: "/profile",
  title: "Profile",
  description: "Update your name and password.",
  icon: User,
};
const usersShortcut: Shortcut = {
  href: "/settings/users",
  title: "Users",
  description: "Invite people and manage their roles.",
  icon: Users,
};

const pipelineShortcut: Shortcut = {
  href: "/settings/pipeline",
  title: "Pipeline",
  description: "Set the stages an opportunity moves through.",
  icon: Kanban,
};

// The landing page after sign-in (D-14): a greeting, the user's role and shortcuts to what
// exists today. A later step replaces the content with the real dashboard.
export function HomePage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }
  // Each role gets the shortcuts to the pages it may open.
  const shortcuts = [
    leadsShortcut,
    opportunitiesShortcut,
    contactsShortcut,
    companiesShortcut,
    ...(me.role === "ADMIN" || me.role === "SALES_MANAGER" ? [activityShortcut] : []),
    profileShortcut,
    ...(me.role === "ADMIN" ? [usersShortcut, pipelineShortcut] : []),
  ];

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">Hello, {me.name}</h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>You are signed in as</span>
          <RoleBadge role={me.role} />
        </div>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.href}>
            <Link
              href={shortcut.href}
              className="group bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex h-full items-start gap-3 rounded-lg border p-4 outline-none focus-visible:ring-3"
            >
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                <shortcut.icon aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium">{shortcut.title}</span>
                <span className="text-muted-foreground text-sm">{shortcut.description}</span>
              </span>
              <ArrowRight
                aria-hidden
                className="text-muted-foreground group-hover:text-primary mt-0.5 size-4 shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
