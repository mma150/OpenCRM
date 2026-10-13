"use client";

import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchOrganization, selectOrganization } from "./organization.slice";

// Loads the organisation settings for a component that needs them (the default tax rate in
// the product dialog and the quote editor) and returns the slice: { data, status, error }.
export function useOrganization() {
  const dispatch = useAppDispatch();
  const organization = useAppSelector(selectOrganization);

  useEffect(() => {
    void dispatch(fetchOrganization());
  }, [dispatch]);

  return organization;
}
