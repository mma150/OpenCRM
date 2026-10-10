"use client";

import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { selectAuth } from "@/features/auth/auth.slice";
import { useLogout } from "@/features/auth/use-logout";
import { useAppSelector } from "@/store/hooks";

import { AppSidebar } from "./app-sidebar";
import { BottomTabBar } from "./bottom-tab-bar";
import { navItemsFor } from "./nav-items";
import { TopBar } from "./top-bar";

// The frame around every signed-in page (D-13). It is rendered inside AuthGate, so there is
// always a signed-in user here.
//   phone  (below md): top bar + fixed bottom tab bar
//   tablet (md to lg): sidebar collapsed to icons + top bar
//   desktop (lg up):   full sidebar + top bar
export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useAppSelector(selectAuth);
  const logout = useLogout();

  if (!me) {
    return null;
  }
  const items = navItemsFor(me.role);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh">
        <AppSidebar items={items} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar name={me.name} email={me.email} onLogout={logout} />
          {/* The bottom padding on phones keeps the last line clear of the tab bar. */}
          <main className="w-full flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] wrap-anywhere md:p-6 md:pb-6 lg:p-8 lg:pb-8">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">{children}</div>
          </main>
        </div>
        <BottomTabBar items={items} onLogout={logout} />
      </div>
    </TooltipProvider>
  );
}
