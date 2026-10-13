import { beforeEach, describe, expect, it, vi } from "vitest";

import * as contactsApi from "@/features/contacts/contacts.api";
import { liam as liamContact } from "@/features/contacts/contacts.fixtures";
import { fetchContact } from "@/features/contacts/contacts.slice";
import * as leadsApi from "@/features/leads/leads.api";
import { liam as liamLead, marcus as marcusLead } from "@/features/leads/leads.fixtures";
import { fetchLead } from "@/features/leads/leads.slice";
import * as opportunitiesApi from "@/features/opportunities/opportunities.api";
import { fleet } from "@/features/opportunities/opportunities.fixtures";
import { fetchOpportunity } from "@/features/opportunities/opportunities.slice";
import { emailSent, savedEntry } from "@/features/timeline/timeline.fixtures";
import { sendEmail } from "@/features/timeline/timeline.slice";
import { makeStore } from "@/store";

import * as emailsApi from "./emails.api";

vi.mock("./emails.api");
vi.mock("@/features/leads/leads.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/opportunities/opportunities.api");

const SENT_AT = "2026-10-12T10:00:00.000Z";
const input = { to: ["someone@acme.example"], subject: "Hello", body: "Hi" };

// An email that went out moves the record's "Last contact", exactly as a conversation does.
describe("sending an email: last contact", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(emailsApi.sendEmail).mockResolvedValue(
      savedEntry({ ...emailSent, occurredAt: SENT_AT }),
    );
  });

  it("moves a lead's forward", async () => {
    vi.mocked(leadsApi.getLead).mockResolvedValue(liamLead);
    const store = makeStore();
    await store.dispatch(fetchLead(liamLead.id));
    expect(store.getState().leads.current.data?.lastContactAt).toBeNull();

    await store.dispatch(sendEmail({ record: { type: "lead", id: liamLead.id }, input }));

    expect(store.getState().leads.current.data?.lastContactAt).toBe(SENT_AT);
  });

  it("moves a contact's forward", async () => {
    vi.mocked(contactsApi.getContact).mockResolvedValue({ ...liamContact, lastContactAt: null });
    const store = makeStore();
    await store.dispatch(fetchContact(liamContact.id));

    await store.dispatch(sendEmail({ record: { type: "contact", id: liamContact.id }, input }));

    expect(store.getState().contacts.current.data?.lastContactAt).toBe(SENT_AT);
  });

  it("moves an opportunity's forward", async () => {
    vi.mocked(opportunitiesApi.getOpportunity).mockResolvedValue(fleet);
    const store = makeStore();
    await store.dispatch(fetchOpportunity(fleet.id));

    await store.dispatch(sendEmail({ record: { type: "opportunity", id: fleet.id }, input }));

    expect(store.getState().opportunities.current.data?.lastContactAt).toBe(SENT_AT);
  });

  it("never moves it back, and leaves a record of another type with the same id alone", async () => {
    const later = { ...marcusLead, lastContactAt: "2026-10-13T08:00:00.000Z" };
    vi.mocked(leadsApi.getLead).mockResolvedValue(later);
    vi.mocked(contactsApi.getContact).mockResolvedValue({
      ...liamContact,
      id: later.id,
      lastContactAt: null,
    });
    const store = makeStore();
    await store.dispatch(fetchLead(later.id));
    await store.dispatch(fetchContact(later.id));

    await store.dispatch(sendEmail({ record: { type: "lead", id: later.id }, input }));

    expect(store.getState().leads.current.data?.lastContactAt).toBe(later.lastContactAt);
    expect(store.getState().contacts.current.data?.lastContactAt).toBeNull();
  });

  it("moves nothing when the email did not go out", async () => {
    vi.mocked(emailsApi.sendEmail).mockRejectedValue({
      code: "EMAIL_NOT_CONFIGURED",
      message: "x",
      details: null,
    });
    vi.mocked(leadsApi.getLead).mockResolvedValue(liamLead);
    const store = makeStore();
    await store.dispatch(fetchLead(liamLead.id));

    await store.dispatch(sendEmail({ record: { type: "lead", id: liamLead.id }, input }));

    expect(store.getState().leads.current.data?.lastContactAt).toBeNull();
  });
});
