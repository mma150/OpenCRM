import "./globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { StoreProvider } from "@/store/store-provider";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "OpenCRM" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen p-4 sm:p-8">
        <main className="mx-auto w-full max-w-xl wrap-anywhere">
          <StoreProvider>{children}</StoreProvider>
        </main>
      </body>
    </html>
  );
}
