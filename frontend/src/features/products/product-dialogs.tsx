"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/features/organization/use-organization";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { formatPercent } from "@/lib/format";
import { useAppDispatch } from "@/store/hooks";

import { archiveProduct, createProduct, deleteProduct, updateProduct } from "./products.slice";
import type { CreateProductInput, Product, UpdateProductInput } from "./products.types";

// The dialog the products page can open.
export type ProductDialog = { kind: "add" } | { kind: "edit" | "delete"; product: Product } | null;

// Money and percent as the API takes them: digits with at most two decimals.
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

const productSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(200, "Use 200 characters or fewer."),
    sku: z.string().trim().max(60, "Use 60 characters or fewer."),
    description: z.string().trim().max(2000, "Use 2,000 characters or fewer."),
    // Numbers are text in the form and JSON numbers in the request.
    unitPrice: z
      .string()
      .trim()
      .regex(MONEY, "Enter a price such as 149.99, without a currency sign."),
    useDefaultTax: z.boolean(),
    taxRate: z.string().trim(),
  })
  .superRefine((values, context) => {
    // The product's own rate is only needed when it does not follow the default.
    const valid = PERCENT.test(values.taxRate) && Number(values.taxRate) <= 100;
    if (!values.useDefaultTax && !valid) {
      context.addIssue({
        code: "custom",
        path: ["taxRate"],
        message: "Enter a rate from 0 to 100, with at most two decimals.",
      });
    }
  });

type ProductValues = z.infer<typeof productSchema>;

const PRODUCT_FIELDS = ["name", "sku", "description", "unitPrice", "taxRate"] as const;

function taxRateOf(values: ProductValues): number | null {
  return values.useDefaultTax ? null : Number(values.taxRate);
}

// A new product: empty text is left out; "use the default" is sent as `taxRate: null`.
function createInput(values: ProductValues): CreateProductInput {
  return {
    name: values.name,
    unitPrice: Number(values.unitPrice),
    ...(values.sku ? { sku: values.sku } : {}),
    ...(values.description ? { description: values.description } : {}),
    taxRate: taxRateOf(values),
  };
}

// An edit sends only what changed; an emptied text is sent as null, which clears it.
function changesOf(values: ProductValues, product: Product): UpdateProductInput {
  const changes: UpdateProductInput = {};
  if (values.name !== product.name) {
    changes.name = values.name;
  }
  if ((values.sku || null) !== product.sku) {
    changes.sku = values.sku || null;
  }
  if ((values.description || null) !== product.description) {
    changes.description = values.description || null;
  }
  if (Number(values.unitPrice) !== product.unitPrice) {
    changes.unitPrice = Number(values.unitPrice);
  }
  if (taxRateOf(values) !== product.taxRate) {
    changes.taxRate = taxRateOf(values);
  }
  return changes;
}

// Adds a product, or edits one.
function ProductFormDialog({ product, onClose }: { product?: Product; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { data: organization } = useOrganization();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      description: product?.description ?? "",
      unitPrice: product ? String(product.unitPrice) : "",
      useDefaultTax: product ? product.taxRate === null : true,
      taxRate: product?.taxRate == null ? "" : String(product.taxRate),
    },
  });
  const useDefaultTax = useWatch({ control: form.control, name: "useDefaultTax" });

  async function onSubmit(values: ProductValues) {
    setFormError(null);
    try {
      if (product) {
        const changes = changesOf(values, product);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateProduct({ id: product.id, changes })).unwrap();
          toast.success(`${values.name} was saved.`);
        }
      } else {
        await dispatch(createProduct(createInput(values))).unwrap();
        toast.success(`${values.name} was added to the catalog.`);
      }
      onClose();
    } catch (error) {
      // A SKU another product has arrives as VALIDATION_FAILED on `sku` and lands on the field.
      setFormError(applyServerError(error as ApiError, form.setError, PRODUCT_FIELDS));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle className="pr-8 wrap-anywhere">
              {product ? `Edit ${product.name}` : "New product"}
            </DialogTitle>
            <DialogDescription>
              {product
                ? "Quotes that already use this product keep the price and tax rate they were made with."
                : "A product can be added to the lines of a quote."}
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField control={form.control} name="name" label="Name">
                {(field) => (
                  <Input {...field} autoComplete="off" maxLength={200} className="h-10" />
                )}
              </FormField>
            </div>
            <FormField
              control={form.control}
              name="sku"
              label="SKU"
              description="Optional. No two products share one."
            >
              {(field) => <Input {...field} autoComplete="off" maxLength={60} className="h-10" />}
            </FormField>
            <FormField control={form.control} name="unitPrice" label="Unit price (USD)">
              {(field) => (
                <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
              )}
            </FormField>
            <div className="sm:col-span-2">
              <FormField control={form.control} name="description" label="Description">
                {(field) => <Textarea {...field} rows={3} maxLength={2000} />}
              </FormField>
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:col-span-2">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4 shrink-0"
                  {...form.register("useDefaultTax")}
                />
                <span className="min-w-0">
                  Use the organisation&apos;s default tax rate
                  {organization ? ` (${formatPercent(organization.defaultTaxRate)})` : ""}
                </span>
              </label>
              {useDefaultTax ? null : (
                <FormField
                  control={form.control}
                  name="taxRate"
                  label="Tax rate (%)"
                  description="From 0 to 100. Enter 0 for a product that is not taxed."
                >
                  {(field) => (
                    <Input {...field} inputMode="decimal" autoComplete="off" className="h-10" />
                  )}
                </FormField>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : product ? "Save" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Asks before deleting a product. One that a quote uses cannot be deleted (PRODUCT_IN_USE):
// the dialog then says so and offers to archive it instead, right there.
function DeleteProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inUse = error?.code === "PRODUCT_IN_USE";

  async function run(action: "delete" | "archive") {
    setWorking(true);
    setError(null);
    try {
      if (action === "delete") {
        await dispatch(deleteProduct(product.id)).unwrap();
        toast.success(`${product.name} was deleted.`);
      } else {
        await dispatch(archiveProduct(product.id)).unwrap();
        toast.success(`${product.name} was archived.`);
      }
      onClose();
    } catch (caught) {
      // The dialog stays open and explains.
      setError(caught as ApiError);
      setWorking(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !working) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">Delete {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The product is removed from the catalog for everyone. This cannot be undone. A product
            that is on a quote cannot be deleted, only archived.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error ? describeApiError(error) : null} />
        {inUse && !product.active ? (
          <p className="text-muted-foreground text-sm">
            It is already archived, so it is no longer offered for new quotes.
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10 px-4" disabled={working}>
            {inUse ? "Close" : "Cancel"}
          </AlertDialogCancel>
          {inUse ? (
            product.active ? (
              <Button
                type="button"
                className="h-10 px-4"
                disabled={working}
                onClick={() => void run("archive")}
              >
                {working ? "Archiving..." : "Archive instead"}
              </Button>
            ) : null
          ) : (
            <Button
              type="button"
              variant="destructive"
              className="h-10 px-4"
              disabled={working}
              onClick={() => void run("delete")}
            >
              {working ? "Deleting..." : "Delete"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// The dialogs of the products page.
export function ProductDialogs({
  dialog,
  onClose,
}: {
  dialog: ProductDialog;
  onClose: () => void;
}) {
  if (!dialog) {
    return null;
  }
  switch (dialog.kind) {
    case "add":
      return <ProductFormDialog onClose={onClose} />;
    case "edit":
      return <ProductFormDialog product={dialog.product} onClose={onClose} />;
    case "delete":
      return <DeleteProductDialog product={dialog.product} onClose={onClose} />;
  }
}
