"use client";

import { type ReactNode, useEffect } from "react";

import { RecordLoader } from "@/components/shared/record-loader";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchQuote, selectCurrentQuote } from "./quotes.slice";
import type { Quote } from "./quotes.types";

// Loads one quote for its page and for the editor and renders `children` with it. Loading,
// "not found" and a failed load are drawn by the shared RecordLoader.
export function QuoteLoader({
  id,
  children,
}: {
  id: string;
  children: (quote: Quote) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectCurrentQuote);

  useEffect(() => {
    void dispatch(fetchQuote(id));
  }, [dispatch, id]);

  return (
    <RecordLoader
      id={id}
      current={current}
      noun="quote"
      backHref="/quotes"
      backLabel="Back to quotes"
      onRetry={() => void dispatch(fetchQuote(id))}
    >
      {children}
    </RecordLoader>
  );
}
