import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";

import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";

type Values = { email: string };

// A small form that fails the way the API does, to show where each kind of error lands.
function TestForm({ serverError }: { serverError: ApiError }) {
  const form = useForm<Values>({ defaultValues: { email: "" } });
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(event) =>
        void form.handleSubmit(() => {
          setFormError(applyServerError(serverError, form.setError, ["email"]));
        })(event)
      }
    >
      <FormAlert message={formError} />
      <FormField control={form.control} name="email" label="Email" description="Your work email.">
        {(field) => <Input {...field} />}
      </FormField>
      <button type="submit">Save</button>
    </form>
  );
}

async function submit(serverError: ApiError) {
  render(<TestForm serverError={serverError} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
}

describe("FormField", () => {
  it("ties the label and the hint to the control", () => {
    render(
      <TestForm serverError={{ code: "INTERNAL_ERROR", message: "Server text", details: null }} />,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAccessibleDescription("Your work email.");
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("shows a server validation message on the field it names", async () => {
    await submit({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [{ path: "email", message: "Email is already taken" }],
    });

    const input = await screen.findByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Email is already taken/);
    // Nothing is left over for the form-level alert: the only alert is the field's.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a validation problem on an unknown field above the form instead", async () => {
    await submit({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [{ path: "somethingElse", message: "Not on this form" }],
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of the details are not valid. Check them and try again.",
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "false");
  });

  it("shows any other error code above the form", async () => {
    await submit({ code: "EMAIL_IN_USE", message: "Server text", details: null });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another user already has this email address.",
    );
  });
});
