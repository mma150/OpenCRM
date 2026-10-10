"use client";

import { useEffect } from "react";

import { RoleBadge } from "@/components/shared/badges";
import { FormAlert } from "@/components/shared/form-alert";
import { PageError } from "@/components/shared/page-state";
import { selectAuth } from "@/features/auth/auth.slice";
import { describeApiError } from "@/lib/api/error-messages";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchMyDashboard, selectMyDashboard } from "./dashboard.slice";
import { seesTeamDashboard } from "./dashboard-labels";
import { MyDashboardSkeleton, MyDashboardView } from "./my-dashboard";
import { TeamSection } from "./team-section";

// Home, the page after sign-in: a greeting, the signed-in user's own dashboard and, for an
// Admin and a Sales Manager, the Team section. The two parts load on their own, so one that
// fails shows its own error with Retry and the other stays.
export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectMyDashboard);

  useEffect(() => {
    void dispatch(fetchMyDashboard());
  }, [dispatch]);

  if (!me) {
    return null;
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">Hello, {me.name}</h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>You are signed in as</span>
          <RoleBadge role={me.role} />
        </div>
      </header>

      {/* A failed reload keeps the last numbers on screen, so say that they are out of date. */}
      {data && status === "failed" && error ? (
        <FormAlert message={describeApiError(error)} />
      ) : null}

      {data ? (
        <MyDashboardView
          dashboard={data}
          me={me}
          onChanged={() => void dispatch(fetchMyDashboard())}
        />
      ) : status === "failed" && error ? (
        <PageError error={error} onRetry={() => void dispatch(fetchMyDashboard())} />
      ) : (
        <MyDashboardSkeleton />
      )}

      {seesTeamDashboard(me.role) ? <TeamSection /> : null}
    </>
  );
}
