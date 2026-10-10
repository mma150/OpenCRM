import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import { getMyDashboard, getTeamDashboard } from "./dashboard.api";
import { busy, empty, team } from "./dashboard.fixtures";
import { fetchMyDashboard, fetchTeamDashboard } from "./dashboard.slice";
import type { MyDashboard, TeamDashboard } from "./dashboard.types";
import { teamRangeDays } from "./dashboard-labels";

vi.mock("./dashboard.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Not allowed", details: null };
const october = { from: "2026-10-01", to: "2026-10-10" };
const september = { from: "2026-09-01", to: "2026-09-30" };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("dashboard slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    const { dashboard } = makeStore().getState();
    expect(dashboard.me).toEqual({ data: null, status: "idle", error: null });
    expect(dashboard.team).toEqual({ data: null, status: "idle", error: null, query: null });
  });

  it("loads the user's own dashboard, and does not ask twice at once", async () => {
    const request = deferred<MyDashboard>();
    vi.mocked(getMyDashboard).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchMyDashboard());
    expect(store.getState().dashboard.me.status).toBe("loading");
    await store.dispatch(fetchMyDashboard());
    expect(getMyDashboard).toHaveBeenCalledTimes(1);

    request.resolve(busy);
    await pending;
    expect(store.getState().dashboard.me).toEqual({ data: busy, status: "succeeded", error: null });
  });

  it("keeps the last numbers when a reload fails", async () => {
    vi.mocked(getMyDashboard).mockResolvedValueOnce(empty).mockRejectedValue(forbidden);
    const store = makeStore();
    await store.dispatch(fetchMyDashboard());

    await store.dispatch(fetchMyDashboard());

    expect(store.getState().dashboard.me).toEqual({
      data: empty,
      status: "failed",
      error: forbidden,
    });
  });

  it("loads the team figures for a range and keeps the range", async () => {
    vi.mocked(getTeamDashboard).mockResolvedValue(team);
    const store = makeStore();

    await store.dispatch(fetchTeamDashboard(october));

    expect(getTeamDashboard).toHaveBeenCalledWith(october);
    expect(store.getState().dashboard.team).toEqual({
      data: team,
      status: "succeeded",
      error: null,
      query: october,
    });
    // The user's own dashboard is another request.
    expect(getMyDashboard).not.toHaveBeenCalled();
  });

  it("drops the answer for an older range", async () => {
    const old = deferred<TeamDashboard>();
    vi.mocked(getTeamDashboard).mockReturnValueOnce(old.promise).mockResolvedValueOnce(team);
    const store = makeStore();

    const first = store.dispatch(fetchTeamDashboard(september));
    await store.dispatch(fetchTeamDashboard(october));
    old.resolve({ ...team, reps: [] });
    await first;

    expect(store.getState().dashboard.team.data).toEqual(team);
    expect(store.getState().dashboard.team.query).toEqual(october);
  });

  it("goes failed and keeps the ApiError when the team figures are refused", async () => {
    vi.mocked(getTeamDashboard).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchTeamDashboard(october));

    expect(store.getState().dashboard.team.status).toBe("failed");
    expect(store.getState().dashboard.team.error).toEqual(forbidden);
  });
});

describe("team ranges", () => {
  const today = new Date(2026, 9, 10, 15, 0);
  const custom = { from: "2026-01-05", to: "2026-02-01" };

  it("turns each range into the days it covers, in the viewer's time zone", () => {
    expect(teamRangeDays("this-month", custom, today)).toEqual(october);
    expect(teamRangeDays("last-month", custom, today)).toEqual(september);
    expect(teamRangeDays("7d", custom, today)).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    expect(teamRangeDays("30d", custom, today)).toEqual({ from: "2026-09-11", to: "2026-10-10" });
    expect(teamRangeDays("custom", custom, today)).toEqual(custom);
  });

  it("knows last month in January is December of the year before", () => {
    expect(teamRangeDays("last-month", custom, new Date(2027, 0, 3))).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});
