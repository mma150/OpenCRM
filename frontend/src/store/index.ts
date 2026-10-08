import { configureStore } from "@reduxjs/toolkit";

import { healthReducer } from "@/features/health/health.slice";

// A factory, not a global: every StoreProvider mount (and every test) gets its own store.
export const makeStore = () => configureStore({ reducer: { health: healthReducer } });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
