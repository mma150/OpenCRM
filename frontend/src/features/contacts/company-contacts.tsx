"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageError, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/http";

import { listContacts } from "./contacts.api";
import type { ContactList } from "./contacts.types";

// How many contacts the card shows. A company with more links to the contacts list,
// filtered by this company, where they can be searched and paged.
const SHOWN = 10;
const SKELETON_ROWS = [0, 1, 2];

// What the request answered, with the company it was asked for.
type Answer = { companyId: string } & ({ list: ContactList } | { error: ApiError });

// The Contacts card on a company's page (CONT-03): the people linked to the company that
// the signed-in user may see, by name, each a link to the contact. `addHref` is the
// new-contact form with this company filled in; leave it out for a user who may not add one.
// The answer does not enter the store: only this card shows it, and the contacts slice's
// own list belongs to the /contacts page.
export function CompanyContacts({ companyId, addHref }: { companyId: string; addHref?: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Counts the retries, so Retry asks again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    listContacts({ companyId, sort: "name", order: "asc", page: 1, pageSize: SHOWN }).then(
      (list) => {
        if (current) {
          setAnswer({ companyId, list });
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setAnswer({ companyId, error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [companyId, attempt]);

  // Never show one company's contacts under another company.
  const mine = answer?.companyId === companyId ? answer : null;
  const list = mine && "list" in mine ? mine.list : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <h2>Contacts</h2>
          {list ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium">
              {list.total} total
            </span>
          ) : null}
        </CardTitle>
        {addHref ? (
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href={addHref}>
              <Plus aria-hidden />
              Add contact
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mine === null ? (
          <div role="status" aria-label="Loading contacts" className="flex flex-col gap-4">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : "error" in mine ? (
          <PageError
            error={mine.error}
            onRetry={() => {
              setAttempt(attempt + 1);
            }}
          />
        ) : mine.list.contacts.length === 0 ? (
          <PageState
            icon={Users}
            title="No contacts yet"
            description={
              addHref
                ? "Add the people you deal with at this company."
                : "Contacts linked to this company will show here."
            }
          />
        ) : (
          <>
            <ul aria-label="Contacts" className="flex min-w-0 flex-col divide-y">
              {mine.list.contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="hover:text-primary focus-visible:ring-ring/50 rounded-sm text-sm font-medium wrap-anywhere outline-none focus-visible:ring-3"
                    >
                      {contact.name}
                    </Link>
                    {contact.jobTitle ? (
                      <p className="text-muted-foreground text-xs wrap-anywhere">
                        {contact.jobTitle}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground flex min-w-0 flex-col text-sm">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="hover:text-primary focus-visible:ring-ring/50 self-start rounded-sm wrap-anywhere outline-none focus-visible:ring-3"
                      >
                        {contact.email}
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="hover:text-primary focus-visible:ring-ring/50 self-start rounded-sm wrap-anywhere outline-none focus-visible:ring-3"
                      >
                        {contact.phone}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {mine.list.total > mine.list.contacts.length ? (
              <Button asChild variant="outline" className="h-10 self-center px-4">
                <Link href={`/contacts?companyId=${companyId}`}>
                  View all {mine.list.total} contacts
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
