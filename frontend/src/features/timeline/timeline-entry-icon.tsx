import {
  ArrowRightLeft,
  CirclePlus,
  FileText,
  MessageSquare,
  Receipt,
  Send,
  StickyNote,
  UserRoundPen,
  XCircle,
} from "lucide-react";

import type { TimelineEntry } from "./timeline.types";
import { CONVERSATION_TYPE_ICONS, isMarkedLost } from "./timeline-labels";

// The icon for an entry's kind; a conversation gets the icon of its type.
export function TimelineEntryIcon({
  entry,
  className,
}: {
  entry: TimelineEntry;
  className?: string;
}) {
  switch (entry.kind) {
    case "CONVERSATION": {
      const Icon = entry.conversationType
        ? CONVERSATION_TYPE_ICONS[entry.conversationType]
        : MessageSquare;
      return <Icon aria-hidden className={className} />;
    }
    case "NOTE":
      return <StickyNote aria-hidden className={className} />;
    case "CREATED":
      return <CirclePlus aria-hidden className={className} />;
    case "STATUS_CHANGE":
      return isMarkedLost(entry) ? (
        <XCircle aria-hidden className={className} />
      ) : (
        <ArrowRightLeft aria-hidden className={className} />
      );
    case "ASSIGNMENT":
      return <UserRoundPen aria-hidden className={className} />;
    // An email sent from the record through the app. An email someone only wrote down is
    // a conversation and keeps the envelope.
    case "EMAIL":
      return <Send aria-hidden className={className} />;
    case "QUOTE_STATUS":
      return <FileText aria-hidden className={className} />;
    case "INVOICE_STATUS":
      return <Receipt aria-hidden className={className} />;
  }
}
