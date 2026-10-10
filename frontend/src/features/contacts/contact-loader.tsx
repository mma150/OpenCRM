"use client";

import { type ReactNode, useEffect } from "react";

import { RecordLoader } from "@/components/shared/record-loader";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchContact, selectCurrentContact } from "./contacts.slice";
import type { Contact } from "./contacts.types";

// Loads one contact for the detail and edit pages and renders `children` with it. Loading,
// "not found" and a failed load are drawn by the shared RecordLoader.
export function ContactLoader({
  id,
  children,
}: {
  id: string;
  children: (contact: Contact) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectCurrentContact);

  useEffect(() => {
    void dispatch(fetchContact(id));
  }, [dispatch, id]);

  return (
    <RecordLoader
      id={id}
      current={current}
      noun="contact"
      backHref="/contacts"
      backLabel="Back to contacts"
      onRetry={() => void dispatch(fetchContact(id))}
    >
      {children}
    </RecordLoader>
  );
}
