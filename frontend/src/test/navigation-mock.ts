import { act } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

// The stand-in for next/navigation in every test (registered in vitest.setup.ts).
// Tests read `mockRouter` to see where a component navigated, and call `setMockLocation`
// to choose the current path and query string.
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

let location = { pathname: "/", searchParams: new URLSearchParams() };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Components that are already rendered see the new location, as they would in the browser.
export function setMockLocation(pathname: string, search = ""): void {
  location = { pathname, searchParams: new URLSearchParams(search) };
  act(() => {
    for (const listener of listeners) {
      listener();
    }
  });
}

// By default `mockRouter.push` and `replace` only record the call. After this they also
// move the mock location, for a component that reads back the address it wrote
// (URL-synced list state).
export function followNavigation(): void {
  const go = (href: string) => {
    const url = new URL(href, "http://app.invalid");
    setMockLocation(url.pathname, url.search.slice(1));
  };
  mockRouter.push.mockImplementation(go);
  mockRouter.replace.mockImplementation(go);
}

export function resetMockNavigation(): void {
  setMockLocation("/");
  for (const mock of Object.values(mockRouter)) {
    mock.mockReset();
  }
}

export const useRouter = () => mockRouter;
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);
export const useSearchParams = () => useSyncExternalStore(subscribe, () => location.searchParams);
