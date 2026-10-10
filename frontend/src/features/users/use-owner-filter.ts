"use client";

import { useEffect } from "react";

import type { ListFilter } from "@/components/shared/list-toolbar";
import { selectAuth } from "@/features/auth/auth.slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchAssignableUsers, selectAssignableUsers } from "./assignable-users.slice";

// The Owner filter of a list of owned records (leads, contacts, companies), ready to add
// to a ListToolbar's `filters`:
//
//   filters={[...ownFilters, ...useOwnerFilter(state.filters.ownerId, changeOwner)]}
//
// It is for a user who sees more than their own records. Its choices are the people that
// user may assign records to, so the result is empty (no filter) for a Sales Rep and for
// anyone with fewer than two choices.
export function useOwnerFilter(value: string, onChange: (value: string) => void): ListFilter[] {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: assignable } = useAppSelector(selectAssignableUsers);

  useEffect(() => {
    void dispatch(fetchAssignableUsers());
  }, [dispatch]);

  const owners = (assignable ?? []).map((user) => ({ value: user.id, label: user.name }));
  if (!me || me.role === "SALES_REP" || owners.length < 2) {
    return [];
  }
  return [{ label: "Owner", allLabel: "All owners", value, options: owners, onChange }];
}
