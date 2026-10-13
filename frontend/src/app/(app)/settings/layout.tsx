import type { ReactNode } from "react";

import { SettingsFrame } from "@/components/app-shell/settings-nav";

// Every page under /settings gets the Settings area's own navigation.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
