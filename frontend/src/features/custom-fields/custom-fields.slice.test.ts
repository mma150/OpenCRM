import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import {
  archiveCustomField,
  createCustomField,
  deleteCustomField,
  listAllCustomFields,
  listCustomFields,
  reorderCustomFields,
  restoreCustomField,
  updateCustomField,
} from "./custom-fields.api";
import {
  channelField,
  leadFields,
  leadFieldsWithArchived,
  legacyField,
  regionField,
  teamSizeField,
  tierField,
} from "./custom-fields.fixtures";
import * as slice from "./custom-fields.slice";
import type { CustomField } from "./custom-fields.types";

vi.mock("./custom-fields.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "No", details: null };

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const labels = (fields: CustomField[] | null) => fields?.map((field) => field.label);

describe("custom fields slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle for every record type and for the settings", () => {
    const state = makeStore().getState().customFields;
    for (const recordType of ["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"] as const) {
      expect(state.fields[recordType]).toEqual({ data: null, status: "idle", error: null });
    }
    expect(state.settings).toEqual({ data: null, status: "idle", error: null, recordType: null });
  });

  it("loads the fields in use of one record type, and leaves the others alone", async () => {
    const pending = deferred<CustomField[]>();
    vi.mocked(listCustomFields).mockReturnValue(pending.promise);
    const store = makeStore();

    const request = store.dispatch(slice.fetchCustomFields("LEAD"));
    expect(store.getState().customFields.fields.LEAD.status).toBe("loading");
    pending.resolve(leadFields);
    await request;

    expect(listCustomFields).toHaveBeenCalledWith("LEAD");
    expect(store.getState().customFields.fields.LEAD).toEqual({
      data: leadFields,
      status: "succeeded",
      error: null,
    });
    expect(store.getState().customFields.fields.COMPANY.status).toBe("idle");
  });

  it("keeps the ApiError of a failed load", async () => {
    vi.mocked(listCustomFields).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(slice.fetchCustomFields("LEAD"));

    expect(store.getState().customFields.fields.LEAD).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("starts no second request for a record type that is loading, but one for another", async () => {
    const pending = deferred<CustomField[]>();
    vi.mocked(listCustomFields).mockReturnValue(pending.promise);
    const store = makeStore();

    const first = store.dispatch(slice.fetchCustomFields("LEAD"));
    await store.dispatch(slice.fetchCustomFields("LEAD"));
    const other = store.dispatch(slice.fetchCustomFields("COMPANY"));
    pending.resolve([]);
    await Promise.all([first, other]);

    expect(listCustomFields).toHaveBeenCalledTimes(2);
  });

  it("loads the settings list with the archived fields, and publishes the ones in use", async () => {
    vi.mocked(listAllCustomFields).mockResolvedValue(leadFieldsWithArchived);
    const store = makeStore();

    await store.dispatch(slice.fetchCustomFieldSettings("LEAD"));

    const state = store.getState().customFields;
    expect(state.settings).toMatchObject({ status: "succeeded", recordType: "LEAD" });
    expect(state.settings.data).toEqual(leadFieldsWithArchived);
    // Forms and filters see the change without asking again, and never the archived field.
    expect(state.fields.LEAD.data).toEqual(leadFields);
  });

  it("ignores the settings answer for a tab that is no longer open", async () => {
    const leads = deferred<CustomField[]>();
    vi.mocked(listAllCustomFields)
      .mockReturnValueOnce(leads.promise)
      .mockResolvedValueOnce([tierField]);
    const store = makeStore();

    const first = store.dispatch(slice.fetchCustomFieldSettings("LEAD"));
    await store.dispatch(slice.fetchCustomFieldSettings("COMPANY"));
    leads.resolve(leadFields);
    await first;

    expect(store.getState().customFields.settings).toMatchObject({
      recordType: "COMPANY",
      data: [tierField],
    });
  });

  async function loadedStore() {
    vi.mocked(listAllCustomFields).mockResolvedValue(leadFieldsWithArchived);
    const store = makeStore();
    await store.dispatch(slice.fetchCustomFieldSettings("LEAD"));
    return store;
  }

  it("adds a new field after the fields in use and before the archived ones", async () => {
    const added = { ...channelField, id: "new", label: "Budget" };
    vi.mocked(createCustomField).mockResolvedValue(added);
    const store = await loadedStore();

    await store
      .dispatch(slice.createCustomField({ recordType: "LEAD", label: "Budget", type: "TEXT" }))
      .unwrap();

    expect(labels(store.getState().customFields.settings.data)).toEqual([
      "Region",
      "Team size",
      "Renewal date",
      "Preferred channel",
      "Budget",
      "Legacy code",
    ]);
    expect(labels(store.getState().customFields.fields.LEAD.data)).toContain("Budget");
  });

  it("replaces an edited field in place", async () => {
    vi.mocked(updateCustomField).mockResolvedValue({ ...teamSizeField, label: "Headcount" });
    const store = await loadedStore();

    await store
      .dispatch(slice.updateCustomField({ id: teamSizeField.id, changes: { label: "Headcount" } }))
      .unwrap();

    expect(updateCustomField).toHaveBeenCalledWith(teamSizeField.id, { label: "Headcount" });
    expect(labels(store.getState().customFields.settings.data)?.[1]).toBe("Headcount");
  });

  it("moves an archived field out of the fields in use, and a restored one back in, last", async () => {
    vi.mocked(archiveCustomField).mockResolvedValue({ ...regionField, archived: true });
    vi.mocked(restoreCustomField).mockResolvedValue({ ...legacyField, archived: false });
    const store = await loadedStore();

    await store.dispatch(slice.archiveCustomField(regionField.id)).unwrap();
    expect(labels(store.getState().customFields.fields.LEAD.data)).toEqual([
      "Team size",
      "Renewal date",
      "Preferred channel",
    ]);

    await store.dispatch(slice.restoreCustomField(legacyField.id)).unwrap();
    expect(labels(store.getState().customFields.fields.LEAD.data)).toEqual([
      "Team size",
      "Renewal date",
      "Preferred channel",
      "Legacy code",
    ]);
    expect(labels(store.getState().customFields.settings.data)?.at(-1)).toBe("Region");
  });

  it("takes the new order from the API's answer", async () => {
    const reordered = [teamSizeField, regionField, ...leadFieldsWithArchived.slice(2)];
    vi.mocked(reorderCustomFields).mockResolvedValue(reordered);
    const store = await loadedStore();
    const ids = [teamSizeField.id, regionField.id];

    await store.dispatch(slice.reorderCustomFields({ recordType: "LEAD", ids })).unwrap();

    expect(reorderCustomFields).toHaveBeenCalledWith("LEAD", ids);
    expect(store.getState().customFields.settings.data).toEqual(reordered);
  });

  it("removes a deleted field, and leaves the list alone when the API refuses", async () => {
    vi.mocked(deleteCustomField).mockResolvedValueOnce(undefined).mockRejectedValueOnce(forbidden);
    const store = await loadedStore();

    await store.dispatch(slice.deleteCustomField(legacyField)).unwrap();
    expect(labels(store.getState().customFields.settings.data)).not.toContain("Legacy code");

    await expect(store.dispatch(slice.deleteCustomField(regionField)).unwrap()).rejects.toEqual(
      forbidden,
    );
    expect(store.getState().customFields.settings).toMatchObject({
      status: "succeeded",
      error: null,
    });
    expect(labels(store.getState().customFields.settings.data)).toContain("Region");
  });
});
