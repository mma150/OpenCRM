import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Provider } from "react-redux";

import type { Me } from "@/features/auth/auth.types";
import type { AppStore } from "@/store";
import { makeStore } from "@/store";

export const adminUser: Me = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ada Admin",
  email: "ada@example.com",
  role: "ADMIN",
};

export const repUser: Me = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Rob Rep",
  email: "rob@example.com",
  role: "SALES_REP",
};

// A fresh store that already has `me` signed in, as if GET /auth/me had answered.
export function makeSignedInStore(me: Me): AppStore {
  const store = makeStore();
  store.dispatch({ type: "auth/fetchMe/fulfilled", payload: me });
  return store;
}

// Renders inside a real store (never a mocked one) and returns the store and a user-event
// session. Pass `me` to start signed in, or `store` to use one the test built itself.
export function renderWithStore(ui: ReactNode, options: { me?: Me; store?: AppStore } = {}) {
  const store = options.store ?? (options.me ? makeSignedInStore(options.me) : makeStore());
  const user = userEvent.setup();
  return { store, user, ...render(<Provider store={store}>{ui}</Provider>) };
}
