import { type ReactNode, Suspense } from "react";

import { GuestGate } from "@/features/auth/guest-gate";

// Signed-out pages. Suspense is required because they read the query string (?next=, ?token=).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <GuestGate>{children}</GuestGate>
    </Suspense>
  );
}
