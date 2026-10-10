"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { pageTitle } from "./nav-items";
import { UserMenu } from "./user-menu";
import { Wordmark } from "./wordmark";

// Page title on the left, user menu on the right. Phones have no sidebar, so there the
// left side carries the OpenCRM name instead.
export function TopBar({
  name,
  email,
  onLogout,
}: {
  name: string;
  email: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className="bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6 lg:px-8">
      <Link href="/" className="rounded-md outline-none focus-visible:ring-3 md:hidden">
        <Wordmark />
      </Link>
      <p className="hidden min-w-0 truncate text-sm font-medium md:block">{pageTitle(pathname)}</p>
      <UserMenu name={name} email={email} onLogout={onLogout} />
    </header>
  );
}
