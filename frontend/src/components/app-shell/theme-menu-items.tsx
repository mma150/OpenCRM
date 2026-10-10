"use client";

import { useTheme } from "next-themes";

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// The Light / Dark / System choice, shared by the user menu and the phone's "More" menu.
export function ThemeMenuItems({ itemClassName }: { itemClassName?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
        {THEMES.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            className={itemClassName}
            // Keep the menu open, so the user sees the theme change before leaving.
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
