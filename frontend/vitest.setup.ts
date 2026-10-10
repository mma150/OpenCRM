import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetMockNavigation } from "./src/test/navigation-mock";

// Components never talk to the real Next.js router in tests: see src/test/navigation-mock.ts.
vi.mock("next/navigation", () => import("./src/test/navigation-mock"));

// jsdom lacks these browser APIs, which the Radix menus, selects and tooltips call.
class ResizeObserverStub {
  observe(): void {
    // Nothing to observe: jsdom does no layout.
  }
  unobserve(): void {
    // See observe.
  }
  disconnect(): void {
    // See observe.
  }
}
globalThis.ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = () => undefined;
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => undefined;

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  resetMockNavigation();
});
