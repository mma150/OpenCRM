"use client";

import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchEmailStatus, selectEmailStatus } from "./email-settings.slice";

// Whether outgoing email is on, for a component that offers or explains email (the "Send
// email" action, the note on the users page). `enabled` is null until the API has answered,
// so nothing claims "email is off" while it is still loading.
export function useEmailStatus(): { enabled: boolean | null } {
  const dispatch = useAppDispatch();
  const { data } = useAppSelector(selectEmailStatus);

  useEffect(() => {
    void dispatch(fetchEmailStatus());
  }, [dispatch]);

  return { enabled: data ? data.enabled : null };
}
