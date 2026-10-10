"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Provider } from "react-redux";

import { sessionExpired } from "@/features/auth/auth.slice";
import { setUnauthenticatedHandler } from "@/lib/api/http";

import { makeStore } from "./index";

export function StoreProvider({ children }: { children: ReactNode }) {
  // useState(makeStore) creates the store once per mount.
  const [store] = useState(makeStore);

  // The one place a missing or expired session is handled: any request answered with
  // UNAUTHENTICATED signs the user out of the store, and AuthGate sends them to /login.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      store.dispatch(sessionExpired());
    });
    return () => {
      setUnauthenticatedHandler(null);
    };
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
