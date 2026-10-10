import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  channelField,
  leadFields,
  regionField,
  renewalField,
  teamSizeField,
} from "@/features/custom-fields/custom-fields.fixtures";
import type { CustomField, CustomFieldValues } from "@/features/custom-fields/custom-fields.types";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";

import {
  changedCustomFields,
  customFieldDefaults,
  type CustomFieldFormValues,
  customFieldPaths,
  customFieldsForCreate,
  customFieldsSchema,
  CustomFieldsSection,
} from "./custom-fields-form";

type Values = { customFields: CustomFieldFormValues };
type Save = (values: CustomFieldValues | undefined) => void;

// A record form reduced to its custom fields: it creates without `stored` and edits with it,
// exactly as the lead, contact, company and opportunity forms do.
function Harness({
  fields,
  stored,
  onSave,
}: {
  fields: CustomField[];
  stored?: CustomFieldValues;
  // Throws an ApiError to stand in for a request the API refused.
  onSave: Save;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(z.object({ customFields: customFieldsSchema(fields, stored) })),
    defaultValues: { customFields: customFieldDefaults(fields, stored) },
  });

  function onSubmit(values: Values) {
    try {
      onSave(
        stored
          ? changedCustomFields(fields, stored, values.customFields)
          : customFieldsForCreate(fields, values.customFields),
      );
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, customFieldPaths(fields)));
    }
  }

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
      {formError ? <p>{formError}</p> : null}
      <CustomFieldsSection control={form.control} fields={fields} stored={stored} />
      <button type="submit">Save</button>
    </form>
  );
}

function renderForm(fields: CustomField[], stored?: CustomFieldValues, onSave: Save = vi.fn()) {
  const user = userEvent.setup();
  render(<Harness fields={fields} stored={stored} onSave={onSave} />);
  return { user, onSave };
}

// Stands in for a request the API refused: an ApiError is what the form's catch receives.
function refuseWith(error: ApiError): Save {
  return () => {
    throw Object.assign(new Error(error.message), error);
  };
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Save" }));

describe("CustomFieldsSection", () => {
  it("renders nothing for a record type without custom fields", () => {
    renderForm([]);

    expect(screen.queryByText("Custom fields")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("draws one control per field by its type, and marks the required ones", () => {
    renderForm(leadFields);

    expect(screen.getByRole("group", { name: "Custom fields" })).toBeInTheDocument();
    const region = screen.getByRole("combobox", { name: "Region" });
    expect(region).toHaveAttribute("aria-required", "true");
    expect(region).toHaveTextContent("None");
    const teamSize = screen.getByLabelText("Team size");
    expect(teamSize).toHaveAttribute("inputmode", "decimal");
    expect(teamSize).toHaveAttribute("aria-required", "false");
    expect(screen.getByLabelText("Renewal date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Preferred channel")).toHaveAttribute("maxlength", "500");
  });

  it("creates with only the fields that were filled in, a number as a number", async () => {
    const { user, onSave } = renderForm(leadFields);

    await user.click(screen.getByRole("combobox", { name: "Region" }));
    await user.click(await screen.findByRole("option", { name: "South" }));
    await user.type(screen.getByLabelText("Team size"), " 12.5 ");
    await user.type(screen.getByLabelText("Renewal date"), "2026-11-15");
    await save(user);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        [regionField.id]: "South",
        [teamSizeField.id]: 12.5,
        [renewalField.id]: "2026-11-15",
      });
    });
  });

  it("leaves customFields out of a new record when nothing was filled in", async () => {
    const { user, onSave } = renderForm([teamSizeField, channelField]);

    await save(user);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(undefined);
    });
  });

  it("asks for a required field on a new record, and sends nothing", async () => {
    const required = { ...channelField, required: true };
    const { user, onSave } = renderForm([regionField, required]);

    await save(user);

    expect(await screen.findByText("Choose an option.")).toBeInTheDocument();
    expect(screen.getByText("Enter a value.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Region" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("refuses text in a number field and text over 500 characters", async () => {
    const { user, onSave } = renderForm([teamSizeField, channelField]);

    await user.type(screen.getByLabelText("Team size"), "twelve");
    await save(user);
    expect(await screen.findByText("Enter a number such as 12 or 12.5.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Team size"));
    await user.type(screen.getByLabelText("Team size"), "-3");
    await save(user);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ [teamSizeField.id]: -3 });
    });
  });

  it("shows what the record holds, and sends only the fields that changed", async () => {
    const stored = {
      [regionField.id]: "North",
      [teamSizeField.id]: 40,
      [renewalField.id]: "2026-11-15",
      [channelField.id]: "Email",
    };
    const { user, onSave } = renderForm(leadFields, stored);

    expect(screen.getByRole("combobox", { name: "Region" })).toHaveTextContent("North");
    expect(screen.getByLabelText("Team size")).toHaveValue("40");
    expect(screen.getByLabelText("Renewal date")).toHaveValue("2026-11-15");
    expect(screen.getByLabelText("Preferred channel")).toHaveValue("Email");

    await user.clear(screen.getByLabelText("Team size"));
    await user.type(screen.getByLabelText("Team size"), "45");
    // An emptied field is sent as null, which clears it.
    await user.clear(screen.getByLabelText("Preferred channel"));
    await save(user);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ [teamSizeField.id]: 45, [channelField.id]: null });
    });
  });

  it("sends nothing for an edit that changed nothing", async () => {
    const { user, onSave } = renderForm(leadFields, { [regionField.id]: "North" });

    await save(user);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(undefined);
    });
  });

  it("lets a record from before a field became required be saved without it, but not emptied", async () => {
    const required = { ...channelField, required: true };
    // The record has no value for the required dropdown, and one for the required text.
    const stored = { [regionField.id]: null, [required.id]: "Email" };
    const { user, onSave } = renderForm([regionField, required], stored);

    await save(user);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(undefined);
    });

    await user.clear(screen.getByLabelText("Preferred channel"));
    await save(user);
    expect(await screen.findByText("Enter a value.")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps a stored option that was removed since, marked as such, without sending it", async () => {
    const stored = { [regionField.id]: "West" };
    const { user, onSave } = renderForm([regionField], stored);

    const region = screen.getByRole("combobox", { name: "Region" });
    expect(region).toHaveTextContent("West (removed option)");

    await save(user);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(undefined);
    });

    // It is listed last, apart from the options the field has now, and can be left.
    await user.click(region);
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["None", "North", "South", "East", "West (removed option)"]);
    await user.click(screen.getByRole("option", { name: "East" }));
    await save(user);
    await waitFor(() => {
      expect(onSave).toHaveBeenLastCalledWith({ [regionField.id]: "East" });
    });
  });

  it("does not offer a removed option to a record that never held it", async () => {
    const { user } = renderForm([regionField], { [regionField.id]: "North" });

    await user.click(screen.getByRole("combobox", { name: "Region" }));

    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "None",
      "North",
      "South",
      "East",
    ]);
  });

  it("puts the API's errors on the fields they name", async () => {
    const refused: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Invalid",
      details: [
        { path: `customFields.${teamSizeField.id}`, message: "Must be a number" },
        { path: `customFields.${regionField.id}`, message: "Not one of the options" },
      ],
    };
    const onSave = vi.fn<Save>(refuseWith(refused));
    const { user } = renderForm(leadFields, { [regionField.id]: "North" }, onSave);

    await save(user);

    expect(await screen.findByText("Must be a number")).toBeInTheDocument();
    expect(screen.getByText("Not one of the options")).toBeInTheDocument();
    expect(screen.getByLabelText("Team size")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Team size")).toHaveAccessibleDescription("Must be a number");
  });

  it("shows the general message for an error about a field that is not in the form", async () => {
    const refused: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Invalid",
      details: [{ path: "customFields.gone", message: "Not a field in use" }],
    };
    const onSave = vi.fn<Save>(refuseWith(refused));
    const { user } = renderForm([teamSizeField], {}, onSave);

    await save(user);

    expect(await screen.findByText(/Some of the details are not valid/)).toBeInTheDocument();
  });
});
