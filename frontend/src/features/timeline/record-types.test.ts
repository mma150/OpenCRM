import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeStore } from "@/store";

import { recordLabel, recordPath, type RecordRef, type RecordType } from "./record-types";
import { addNote, listTimeline, logConversation } from "./timeline.api";
import { call, companyRecord, contactRecord, leadRecord, timelinePage } from "./timeline.fixtures";
import { fetchTimeline, sameRecord } from "./timeline.slice";

// The shared axios instance, replaced so the test sees which address is asked for.
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: { get, post } }));

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const meta = { page: 1, pageSize: 25, total: 1 };

// One row per record type: a new type adds a row here and a line in RECORD_TYPES.
const TYPES: [RecordType, string, string][] = [
  ["lead", "Lead", `/leads/${ID}`],
  ["contact", "Contact", `/contacts/${ID}`],
  ["company", "Company", `/companies/${ID}`],
  ["opportunity", "Opportunity", `/opportunities/${ID}`],
];

describe("record types", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(TYPES)("names a %s and knows where it lives", (type, label, path) => {
    expect(recordLabel(type)).toBe(label);
    expect(recordPath({ type, id: ID })).toBe(path);
  });

  it.each(TYPES)(
    "reads and writes the timeline of a %s under its own path",
    async (type, _label, path) => {
      const record: RecordRef = { type, id: ID };
      get.mockResolvedValue({ data: { data: [call], meta } });
      post.mockResolvedValue({ data: { data: call, meta: {} } });

      await expect(listTimeline(record, { page: 1, pageSize: 25 })).resolves.toEqual(
        timelinePage([call]),
      );
      expect(get).toHaveBeenCalledWith(`${path}/timeline`, { params: { page: 1, pageSize: 25 } });

      const conversation = {
        type: "CALL",
        occurredAt: call.occurredAt,
        summary: "Spoke.",
      } as const;
      await expect(logConversation(record, conversation)).resolves.toEqual(call);
      expect(post).toHaveBeenLastCalledWith(`${path}/conversations`, conversation);

      await addNote(record, { body: "Remember." });
      expect(post).toHaveBeenLastCalledWith(`${path}/notes`, { body: "Remember." });
    },
  );

  it("tells two records with the same id but another type apart", async () => {
    const twin: RecordRef = { type: "contact", id: leadRecord.id };
    expect(sameRecord(leadRecord, { ...leadRecord })).toBe(true);
    expect(sameRecord(leadRecord, twin)).toBe(false);
    expect(sameRecord(contactRecord, companyRecord)).toBe(false);

    // Opening the twin's timeline never shows the lead's entries under it.
    get.mockResolvedValueOnce({ data: { data: [call], meta } });
    const store = makeStore();
    await store.dispatch(fetchTimeline({ record: leadRecord, filter: "ALL" }));
    expect(store.getState().timeline.data?.entries).toEqual([call]);

    get.mockReturnValueOnce(new Promise(() => undefined));
    void store.dispatch(fetchTimeline({ record: twin, filter: "ALL" }));
    expect(store.getState().timeline).toMatchObject({ data: null, status: "loading" });
  });
});
