import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { activityReducer } from "@/features/activity/activity.slice";
import { authReducer, logout, sessionExpired } from "@/features/auth/auth.slice";
import { companiesReducer } from "@/features/companies/companies.slice";
import { contactsReducer } from "@/features/contacts/contacts.slice";
import { healthReducer } from "@/features/health/health.slice";
import { leadsReducer } from "@/features/leads/leads.slice";
import { opportunitiesReducer } from "@/features/opportunities/opportunities.slice";
import { pipelineStagesReducer } from "@/features/pipeline-stages/pipeline-stages.slice";
import { timelineReducer } from "@/features/timeline/timeline.slice";
import { assignableUsersReducer } from "@/features/users/assignable-users.slice";
import { usersReducer } from "@/features/users/users.slice";

const appReducer = combineReducers({
  activity: activityReducer,
  assignableUsers: assignableUsersReducer,
  auth: authReducer,
  companies: companiesReducer,
  contacts: contactsReducer,
  health: healthReducer,
  leads: leadsReducer,
  opportunities: opportunitiesReducer,
  pipelineStages: pipelineStagesReducer,
  timeline: timelineReducer,
  users: usersReducer,
});

// Logging out, or the session ending, resets every slice to its initial state, so nothing
// loaded for one account can be seen by the next person to sign in on this browser.
const rootReducer: typeof appReducer = (state, action) => {
  if (logout.fulfilled.match(action) || sessionExpired.match(action)) {
    return appReducer(undefined, action);
  }
  return appReducer(state, action);
};

// A factory, not a global: every StoreProvider mount (and every test) gets its own store.
export const makeStore = () => configureStore({ reducer: rootReducer });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
