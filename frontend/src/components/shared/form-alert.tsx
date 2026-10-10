import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

// The message above a form when the problem is not about one field
// (wrong password, locked account, link expired). Renders nothing without a message.
export function FormAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <CircleAlert aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
