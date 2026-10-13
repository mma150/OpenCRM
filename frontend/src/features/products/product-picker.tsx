"use client";

import { Package } from "lucide-react";

import {
  type PickedRecord,
  RecordPicker,
  type RecordPickerKind,
} from "@/components/shared/record-picker";
import { formatMoney } from "@/lib/format";

import { getProduct, listProducts } from "./products.api";

// What the shared record picker needs to know about products: what they are called and how
// to search them (GET /products?search=&active=true, by name or SKU). Archived products are
// left out, because the API does not let one be added to a quote. Each match shows its SKU
// and price under the name.
const PRODUCT: RecordPickerKind = {
  label: "Product",
  noun: "product",
  plural: "products",
  icon: Package,
  search: async (text, pageSize) => {
    const list = await listProducts({
      ...(text ? { search: text } : {}),
      active: "true",
      sort: "name",
      order: "asc",
      page: 1,
      pageSize,
    });
    return {
      matches: list.products.map(({ id, name, sku, unitPrice }) => ({
        id,
        name,
        detail: sku ? `${sku} · ${formatMoney(unitPrice)}` : formatMoney(unitPrice),
      })),
      total: list.total,
    };
  },
  find: getProduct,
};

// Chooses one product of the catalog by searching for its name or SKU. It is the same picker
// as the company's (see `CompanyPicker`), and is used the same way. It hands over the id and
// the name; a form that needs the price and the tax rate asks for the product with
// `getProduct(id)` after the pick, as the quote editor does.
export function ProductPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  // The product that is picked, or null for none.
  value: PickedRecord | null;
  onChange: (product: PickedRecord | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <RecordPicker
      kind={PRODUCT}
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      describedBy={describedBy}
      description="Search the catalog by name or SKU. Archived products are not listed."
    />
  );
}
