import {
  ArrowRightLeft,
  CirclePlus,
  MessageSquare,
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
  }
}
