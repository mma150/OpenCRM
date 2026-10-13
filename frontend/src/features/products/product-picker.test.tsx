import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PickedRecord } from "@/components/shared/record-picker";
import type { ApiError } from "@/lib/api/http";

import { ProductPicker } from "./product-picker";
import { listProducts } from "./products.api";
import { licence, onboarding, productList, tracker } from "./products.fixtures";

vi.mock("./products.api");

const pickerQuery = { active: "true", sort: "name", order: "asc", page: 1, pageSize: 20 };

// The picker with the state a form would keep for it.
function Harness({ initial = null }: { initial?: PickedRecord | null }) {
  const [product, setProduct] = useState<PickedRecord | null>(initial);
  return (
    <>
      <ProductPicker id="productId" value={product} onChange={setProduct} />
      <output>{product ? product.id : "none"}</output>
    </>
  );
}

async function openPicker(initial: PickedRecord | null = null) {
  const user = userEvent.setup();
  render(<Harness initial={initial} />);
  await user.click(
    screen.getByRole("button", { name: initial ? `Product: ${initial.name}` : "Product: none" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Choose a product" });
  return { user, dialog };
}

describe("ProductPicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listProducts).mockResolvedValue(productList([licence, tracker, onboarding]));
  });

  it("asks for nothing until it is opened, then lists the products in use with SKU and price", async () => {
    render(<Harness />);
    expect(listProducts).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Product: none" }));
    const list = await screen.findByRole("list", { name: "Products" });

    // Archived products are left out: the API does not let one be added to a quote.
    expect(listProducts).toHaveBeenCalledWith(pickerQuery);
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    expect(within(list).getByRole("button", { name: /Fleet tracking licence/ })).toHaveTextContent(
      "LIC-FLT-001 · $29.00",
    );
    // A product without a SKU shows its price alone.
    expect(within(list).getByRole("button", { name: /Onboarding package/ })).toHaveTextContent(
      "$1,200.00",
    );
  });

  it("searches by name or SKU once typing has paused, and picks the product that is chosen", async () => {
    const { user, dialog } = await openPicker();
    await within(dialog).findByRole("list", { name: "Products" });
    vi.mocked(listProducts).mockResolvedValue(productList([tracker]));

    await user.type(within(dialog).getByRole("searchbox", { name: "Search products" }), " gps ");

    await waitFor(() => {
      expect(listProducts).toHaveBeenLastCalledWith({ ...pickerQuery, search: "gps" });
    });
    expect(listProducts).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);
    });
    await user.click(within(dialog).getByRole("button", { name: /GPS tracker hardware/ }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(tracker.id);
    expect(
      screen.getByRole("button", { name: "Product: GPS tracker hardware" }),
    ).toBeInTheDocument();
  });

  it("clears the product with the button beside it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ id: licence.id, name: licence.name }} />);

    await user.click(screen.getByRole("button", { name: "Clear product" }));

    expect(screen.getByRole("status")).toHaveTextContent("none");
    expect(screen.getByRole("button", { name: "Product: none" })).toHaveTextContent(
      "Choose a product",
    );
  });

  it("says when nothing matches, and offers Retry when the search fails", async () => {
    vi.mocked(listProducts).mockResolvedValue(productList([]));
    const { user, dialog } = await openPicker();
    expect(await within(dialog).findByText("No products yet.")).toBeInTheDocument();

    const failure: ApiError = { code: "NETWORK_ERROR", message: "offline", details: null };
    vi.mocked(listProducts).mockRejectedValueOnce(failure);
    await user.type(within(dialog).getByRole("searchbox", { name: "Search products" }), "x");
    expect(await within(dialog).findByText(/cannot be reached/)).toBeInTheDocument();

    vi.mocked(listProducts).mockResolvedValue(productList([licence]));
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(
      await within(dialog).findByRole("button", { name: /Fleet tracking licence/ }),
    ).toBeInTheDocument();
  });
});
