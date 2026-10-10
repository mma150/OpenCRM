"use client";

import { Ellipsis, Eye, Pencil, Trash2, UserRoundPen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The two menus of an owned record (a lead, a contact, a company). Both take a handler for
// each action the signed-in user may use and leave out the actions they get no handler for,
// so a page decides once what a role may do and the menu follows.

function ReassignItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <UserRoundPen aria-hidden />
      Reassign
    </DropdownMenuItem>
  );
}

function DeleteItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem variant="destructive" onSelect={onSelect}>
      <Trash2 aria-hidden />
      Delete
    </DropdownMenuItem>
  );
}

// The menu at the end of a list row (and in the corner of its card): View for everyone,
// then Edit, Reassign, the feature's own items (`children`) and Delete.
export function RecordRowMenu({
  name,
  viewHref,
  editHref,
  onReassign,
  onDelete,
  children,
}: {
  // The record's name, for the button's label: "Actions for Marcus Chen".
  name: string;
  viewHref: string;
  editHref?: string;
  onReassign?: () => void;
  onDelete?: () => void;
  // Menu items only this kind of record has (a lead's "Mark as lost").
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="size-11 md:size-9" aria-label={`Actions for ${name}`}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={viewHref}>
            <Eye aria-hidden />
            View
          </Link>
        </DropdownMenuItem>
        {editHref ? (
          <DropdownMenuItem asChild>
            <Link href={editHref}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </DropdownMenuItem>
        ) : null}
        {onReassign ? <ReassignItem onSelect={onReassign} /> : null}
        {children}
        {onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DeleteItem onSelect={onDelete} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The "More actions" button in a record page's header: Reassign, the feature's own items
// (`children`) and Delete. The page's main actions (Edit) are buttons beside it.
export function RecordMoreMenu({
  onReassign,
  onDelete,
  children,
}: {
  onReassign?: () => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="size-10" aria-label="More actions">
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onReassign ? <ReassignItem onSelect={onReassign} /> : null}
        {children}
        {onReassign || children ? <DropdownMenuSeparator /> : null}
        <DeleteItem onSelect={onDelete} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
