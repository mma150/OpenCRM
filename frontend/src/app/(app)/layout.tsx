import { type ReactNode, Suspense } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { AuthGate } from "@/features/auth/auth-gate";

// Signed-in pages: AuthGate lets only a signed-in user through, AppShell is the frame.
// Suspense is required because lists and forms read the query string (filters, ?from=).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>
        <Suspense>{children}</Suspense>
      </AppShell>
    </AuthGate>
  );
}
