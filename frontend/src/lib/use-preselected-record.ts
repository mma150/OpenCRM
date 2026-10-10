"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// The record a "new" form starts with, named by an id in the address: `?companyId=` on the
// new-contact form ("Add contact" on a company's page), `?companyId=` or `?contactId=` on the
// new-opportunity form. `ready` is false while the record is being looked up. A record that
// is gone, or not this user's to see, is simply not filled in.
//
// `lookup` must be the same function on every render: pass an `*.api.ts` function.
export function usePreselectedRecord<Item>(
  param: string,
  enabled: boolean,
  lookup: (id: string) => Promise<Item>,
): { record: Item | null; ready: boolean } {
  const id = useSearchParams().get(param) ?? "";
  // What the lookup answered, with the id it was asked for.
  const [found, setFound] = useState<{ id: string; record: Item | null } | null>(null);
  const wanted = enabled && id !== "";

  useEffect(() => {
    if (!wanted) {
      return;
    }
    let current = true;
    lookup(id).then(
      (record) => {
        if (current) {
          setFound({ id, record });
        }
      },
      () => {
        if (current) {
          setFound({ id, record: null });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [wanted, id, lookup]);

  if (!wanted) {
    return { record: null, ready: true };
  }
  return found?.id === id ? { record: found.record, ready: true } : { record: null, ready: false };
}
