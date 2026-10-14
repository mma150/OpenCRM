import { SearchX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { PageState } from "./page-state";

// An address that matches no page (a mistyped or an old link), in the app's own look and with
// a way back. Home sends a signed-out visitor on to the sign-in page.
export function NotFoundPage() {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <PageState
          icon={SearchX}
          title="Page not found"
          description="There is no page at this address. The link may be mistyped or out of date."
          action={
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href="/">Back to Home</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
