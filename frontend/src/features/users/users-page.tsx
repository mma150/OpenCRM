"use client";

import {
  Ellipsis,
  Info,
  KeyRound,
  MailPlus,
  Pencil,
  Plus,
  ShieldAlert,
  UserCheck,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { RoleBadge, StatusBadge } from "@/components/shared/badges";
import { ListActions } from "@/components/shared/list-actions";
import { PageHeader } from "@/components/shared/page-header";
import { PageState } from "@/components/shared/page-state";
import { type ListColumn, ResponsiveList } from "@/components/shared/responsive-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectAuth } from "@/features/auth/auth.slice";
import { useEmailStatus } from "@/features/email-settings/use-email-status";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { EditUserDialog } from "./edit-user-dialog";
import { InviteUserDialog } from "./invite-user-dialog";
import { type UserAction, UserActionDialog } from "./user-action-dialog";
import { exportUsers } from "./users.api";
import { fetchUsers, selectUsers } from "./users.slice";
import type { User } from "./users.types";

type OpenDialog =
  | { kind: "invite" }
  | { kind: "edit"; user: User }
  | { kind: "action"; action: UserAction; user: User }
  | null;

// A rep whose manager was deactivated keeps the link (D-19), so the list says so.
function ManagerDeactivatedHint({ user }: { user: User }) {
  if (user.manager?.status !== "DEACTIVATED") {
    return null;
  }
  return <span className="text-xs text-amber-700 dark:text-amber-400">Manager deactivated</span>;
}

function NameCell({ user, isSelf }: { user: User; isSelf: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">
        {user.name}
        {isSelf ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
      </p>
      <p className="text-muted-foreground truncate text-xs">{user.email}</p>
    </div>
  );
}

// Which actions fit a user depends on their status; nobody deactivates themselves (D-18).
function UserActionsMenu({
  user,
  isSelf,
  onOpen,
}: {
  user: User;
  isSelf: boolean;
  onOpen: (dialog: OpenDialog) => void;
}) {
  const open = (action: UserAction) => () => {
    onOpen({ kind: "action", action, user });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-11 md:size-9"
          aria-label={`Actions for ${user.name}`}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onSelect={() => {
            onOpen({ kind: "edit", user });
          }}
        >
          <Pencil aria-hidden />
          Edit
        </DropdownMenuItem>
        {user.status === "INVITED" ? (
          <DropdownMenuItem onSelect={open("resend-invite")}>
            <MailPlus aria-hidden />
            Resend invite
          </DropdownMenuItem>
        ) : null}
        {user.status === "ACTIVE" ? (
          <DropdownMenuItem onSelect={open("reset-link")}>
            <KeyRound aria-hidden />
            Generate reset link
          </DropdownMenuItem>
        ) : null}
        {user.status === "DEACTIVATED" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={open("reactivate")}>
              <UserCheck aria-hidden />
              Reactivate
            </DropdownMenuItem>
          </>
        ) : null}
        {user.status !== "DEACTIVATED" && !isSelf ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={open("deactivate")}>
              <UserX aria-hidden />
              Deactivate
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UsersAdmin({ myId }: { myId: string }) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectUsers);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { enabled: emailEnabled } = useEmailStatus();
  const users = data?.users ?? null;
  const close = () => {
    setDialog(null);
  };

  useEffect(() => {
    void dispatch(fetchUsers());
  }, [dispatch]);

  const columns: ListColumn<User>[] = [
    {
      header: "Name",
      cell: (user) => <NameCell user={user} isSelf={user.id === myId} />,
    },
    { header: "Role", className: "w-36", cell: (user) => <RoleBadge role={user.role} /> },
    {
      header: "Manager",
      className: "w-48",
      hideBelow: "lg",
      cell: (user) =>
        user.manager ? (
          <div className="min-w-0">
            <p className="truncate">{user.manager.name}</p>
            <ManagerDeactivatedHint user={user} />
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { header: "Status", className: "w-36", cell: (user) => <StatusBadge status={user.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite people and manage their roles."
        action={
          <>
            <ListActions onExport={exportUsers} />
            <Button
              type="button"
              className="h-10 px-4"
              onClick={() => {
                setDialog({ kind: "invite" });
              }}
            >
              <Plus aria-hidden />
              Invite user
            </Button>
          </>
        }
      />

      {/* Only once the API has said so: `enabled` is null while the answer is on its way. */}
      {emailEnabled === false ? (
        <Alert>
          <Info aria-hidden />
          <AlertDescription className="text-foreground">
            Outgoing email is off. Invite links will be shown for you to copy.{" "}
            <Link href="/settings/email" className="font-medium">
              Set up email
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <ResponsiveList
        label="Users"
        items={users}
        status={status}
        error={error}
        getKey={(user) => user.id}
        columns={columns}
        isDimmed={(user) => user.status === "DEACTIVATED"}
        renderCard={(user) => (
          <div className="flex flex-col gap-3">
            <NameCell user={user} isSelf={user.id === myId} />
            <div className="flex flex-wrap gap-2">
              <RoleBadge role={user.role} />
              <StatusBadge status={user.status} />
            </div>
            {user.manager ? (
              <p className="text-muted-foreground border-t pt-3 text-xs">
                Reports to <span className="text-foreground font-medium">{user.manager.name}</span>
                <span className="block">
                  <ManagerDeactivatedHint user={user} />
                </span>
              </p>
            ) : null}
          </div>
        )}
        rowActions={(user) => (
          <UserActionsMenu user={user} isSelf={user.id === myId} onOpen={setDialog} />
        )}
        empty={{ title: "No users yet", description: "Invite the first person to get started." }}
        onRetry={() => void dispatch(fetchUsers())}
      />

      {dialog?.kind === "invite" ? <InviteUserDialog users={users ?? []} onClose={close} /> : null}
      {dialog?.kind === "edit" ? (
        <EditUserDialog user={dialog.user} users={users ?? []} onClose={close} />
      ) : null}
      {dialog?.kind === "action" ? (
        <UserActionDialog action={dialog.action} user={dialog.user} onClose={close} />
      ) : null}
    </>
  );
}

// /settings/users is for Admins. Everyone else gets a clear "no access" state, not a blank
// page; the API refuses them too (FORBIDDEN), so this is not the security boundary.
export function UsersPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (me.role !== "ADMIN") {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Users"
        description="Only an Admin can invite people and manage their roles."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <UsersAdmin myId={me.id} />;
}
