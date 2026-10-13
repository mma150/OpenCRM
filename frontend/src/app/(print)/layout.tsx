import { type ReactNode, Suspense } from "react";

import { AuthGate } from "@/features/auth/auth-gate";

// Signed-in pages WITHOUT the app frame: the print views of a quote and an invoice. Only
// the document goes on the paper, so there is no sidebar, top bar or tab bar here.
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <Suspense>{children}</Suspense>
    </AuthGate>
  );
}
