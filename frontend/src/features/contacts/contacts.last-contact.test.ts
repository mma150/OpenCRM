import { beforeEach, describe, expect, it, vi } from "vitest";

import * as leadsApi from "@/features/leads/leads.api";
import { marcus as marcusLead } from "@/features/leads/leads.fixtures";
import { fetchLead } from "@/features/leads/leads.slice";
import * as timelineApi from "@/features/timeline/timeline.api";
import { savedEntry } from "@/features/timeline/timeline.fixtures";
import { logConversation } from "@/features/timeline/timeline.slice";
import type { RecordRef } from "@/features/timeline/timeline.types";
import { makeStore } from "@/store";

import * as contactsApi from "./contacts.api";
import { liam, marcus } from "./contacts.fixtures";
import { fetchContact } from "./contacts.slice";

vi.mock("./contacts.api");
vi.mock("@/features/leads/leads.api");
vi.mock("@/features/timeline/timeline.api");

const input = { type: "CALL", occurredAt: "2026-10-09T10:00:00.000Z", summary: "Spoke." } as const;

async function storeWith(contact = marcus) {
  vi.mocked(contactsApi.getContact).mockResolvedValue(contact);
  const store = makeStore();
  await store.dispatch(fetchContact(contact.id));
  return store;
}

describe("contacts slice: last contact", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(timelineApi.logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", occurredAt: input.occurredAt }),
    );
  });

  it("moves forward when a conversation is logged on the open contact", async () => {
    const store = await storeWith(liam);
    const record: RecordRef = { type: "contact", id: liam.id };

    await store.dispatch(logConversation({ record, input }));

    expect(store.getState().contacts.current.data?.lastContactAt).toBe(input.occurredAt);
  });

  it("stays where it is for a conversation that happened earlier", async () => {
    const later = { ...marcus, lastContactAt: "2026-10-09T12:00:00.000Z" };
    const store = await storeWith(later);

    await store.dispatch(logConversation({ record: { type: "contact", id: marcus.id }, input }));

    expect(store.getState().contacts.current.data?.lastContactAt).toBe(later.lastContactAt);
  });

  it("is not moved by a conversation on a record of another type with the same id", async () => {
    const store = await storeWith(liam);
    // A lead that happens to share the contact's id is open too.
    const twin = { ...marcusLead, id: liam.id, lastContactAt: null };
    vi.mocked(leadsApi.getLead).mockResolvedValue(twin);
    await store.dispatch(fetchLead(twin.id));

    await store.dispatch(logConversation({ record: { type: "company", id: liam.id }, input }));
    expect(store.getState().contacts.current.data?.lastContactAt).toBeNull();
    expect(store.getState().leads.current.data?.lastContactAt).toBeNull();

    await store.dispatch(logConversation({ record: { type: "lead", id: liam.id }, input }));
    expect(store.getState().contacts.current.data?.lastContactAt).toBeNull();
    expect(store.getState().leads.current.data?.lastContactAt).toBe(input.occurredAt);
  });
});
