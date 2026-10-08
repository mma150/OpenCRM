import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StoreProvider } from "@/store/store-provider";

export const metadata: Metadata = { title: "OpenCRM" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: "40rem", margin: "0 auto", overflowWrap: "anywhere" }}>
          <StoreProvider>{children}</StoreProvider>
        </main>
      </body>
    </html>
  );
}
