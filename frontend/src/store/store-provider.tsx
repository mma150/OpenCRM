"use client";

import { type ReactNode, useState } from "react";
import { Provider } from "react-redux";

import { makeStore } from "./index";

export function StoreProvider({ children }: { children: ReactNode }) {
  // useState(makeStore) creates the store once per mount.
  const [store] = useState(makeStore);
  return <Provider store={store}>{children}</Provider>;
}
