import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { StoreProvider } from "@/store/store-provider";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "OpenCRM" };

// viewport-fit=cover lets the bottom tab bar pad itself for the iPhone home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

// No page frame here: the (auth) and (app) route groups each bring their own.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the theme class on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh">
        <ThemeProvider>
          <StoreProvider>{children}</StoreProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
