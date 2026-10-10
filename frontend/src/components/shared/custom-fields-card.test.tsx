import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  channelField,
  leadFields,
  regionField,
  renewalField,
  teamSizeField,
} from "@/features/custom-fields/custom-fields.fixtures";

import { CustomFieldsCard } from "./custom-fields-card";

// The <dd> beside a label.
function valueOf(label: string): HTMLElement {
  const term = screen.getByText(label);
  return term.nextElementSibling as HTMLElement;
}

describe("CustomFieldsCard", () => {
  it("renders nothing for a record type without custom fields", () => {
    const { container } = render(<CustomFieldsCard fields={[]} values={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows every field in order, each type as people read it", () => {
    render(
      <CustomFieldsCard
        fields={leadFields}
        values={{
          [regionField.id]: "North",
          [teamSizeField.id]: 12500.5,
          [renewalField.id]: "2026-11-15",
          [channelField.id]: "Email, after 4 pm",
        }}
      />,
    );

    expect(screen.getByText("Custom fields")).toBeInTheDocument();
    expect(valueOf("Region")).toHaveTextContent("North");
    expect(valueOf("Team size")).toHaveTextContent("12,500.5");
    expect(valueOf("Renewal date")).toHaveTextContent("Nov 15, 2026");
    expect(valueOf("Preferred channel")).toHaveTextContent("Email, after 4 pm");
    const labels = [...document.querySelectorAll("dt")].map((term) => term.textContent);
    expect(labels).toEqual(["Region", "Team size", "Renewal date", "Preferred channel"]);
  });

  it("shows the empty marker for a field without a value, and for one the record does not name", () => {
    render(<CustomFieldsCard fields={leadFields} values={{ [regionField.id]: null }} />);

    for (const label of ["Region", "Team size", "Renewal date", "Preferred channel"]) {
      expect(within(valueOf(label)).getByText("—")).toBeInTheDocument();
    }
  });

  it("shows a stored option that the dropdown no longer has", () => {
    render(<CustomFieldsCard fields={[regionField]} values={{ [regionField.id]: "West" }} />);

    expect(valueOf("Region")).toHaveTextContent("West");
  });
});
