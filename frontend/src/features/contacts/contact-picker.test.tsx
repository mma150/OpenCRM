import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContactFilter, ContactPicker, type ContactRef } from "./contact-picker";
import { getContact, listContacts } from "./contacts.api";
import { contactList, liam, marcus } from "./contacts.fixtures";

vi.mock("./contacts.api");

const pickerQuery = { sort: "name", order: "asc", page: 1, pageSize: 20 };

// The picker with the state a form would keep for it.
function Harness({ initial = null }: { initial?: ContactRef | null }) {
  const [contact, setContact] = useState<ContactRef | null>(initial);
  return (
    <>
      <ContactPicker id="contactId" value={contact} onChange={setContact} />
      <output>{contact ? contact.id : "none"}</output>
    </>
  );
}

// The picker itself is the shared record picker, tested through the company picker
// (company-picker.test.tsx). These tests cover what a contact adds to it.
describe("ContactPicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listContacts).mockResolvedValue(contactList());
  });

  it("lists the first contacts by name, each with its company", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(listContacts).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Contact: none" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Choose a contact" }));
    const list = await dialog.findByRole("list", { name: "Contacts" });

    expect(listContacts).toHaveBeenCalledWith(pickerQuery);
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    expect(dialog.getByRole("button", { name: /Marcus Chen/ })).toHaveTextContent(
      "Northwind Logistics",
    );
    // A contact without a company shows its name alone.
    expect(dialog.getByRole("button", { name: "Liam Gallagher" })).toBeInTheDocument();
  });

  it("searches by name once typing has paused, and hands over the contact that is picked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Contact: none" }));
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByRole("list", { name: "Contacts" });
    vi.mocked(listContacts).mockResolvedValue(contactList([marcus]));

    await user.type(dialog.getByRole("searchbox", { name: "Search contacts" }), "chen");
    await waitFor(() => {
      expect(listContacts).toHaveBeenLastCalledWith({ ...pickerQuery, search: "chen" });
    });
    await waitFor(() => {
      expect(dialog.getAllByRole("listitem")).toHaveLength(1);
    });
    await user.click(dialog.getByRole("button", { name: /Marcus Chen/ }));

    expect(screen.getByRole("status")).toHaveTextContent(marcus.id);
    expect(screen.getByRole("button", { name: "Contact: Marcus Chen" })).toBeInTheDocument();
  });

  it("clears the contact with the button beside it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ id: liam.id, name: liam.name }} />);

    await user.click(screen.getByRole("button", { name: "Clear contact" }));

    expect(screen.getByRole("status")).toHaveTextContent("none");
  });
});

describe("ContactFilter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("finds the name of a contact that came from the address, and says what it filters", async () => {
    vi.mocked(getContact).mockResolvedValue(marcus);
    vi.mocked(listContacts).mockResolvedValue(contactList());
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ContactFilter contactId={marcus.id} onChange={onChange} of="opportunities" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Contact" })).toHaveTextContent(
        "Contact:Marcus Chen",
      );
    });
    expect(getContact).toHaveBeenCalledWith(marcus.id);

    await user.click(screen.getByRole("button", { name: "Contact" }));
    expect(
      await screen.findByText("Show only the opportunities of one contact."),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "All contacts" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
