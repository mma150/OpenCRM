"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import {
  type Control,
  Controller,
  type ControllerRenderProps,
  useFieldArray,
  type UseFormSetValue,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";

import type { PickedRecord } from "@/components/shared/record-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProductPicker } from "@/features/products/product-picker";
import { getProduct } from "@/features/products/products.api";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  emptyLine,
  type LINE_FIELDS,
  lineField,
  MAX_QUOTE_LINES,
  type QuoteFormValues,
} from "./quote-form-values";

type LineFieldName = `lines.${number}.${(typeof LINE_FIELDS)[number]}`;

type LineControlProps = ControllerRenderProps<QuoteFormValues, LineFieldName> & {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

// From `xl` a line is one row of a grid under shared column headings; below it the fields
// stack (see LineRow), so every field carries its own label there.
const ROW_GRID =
  "grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-[minmax(0,1fr)_5.5rem_7rem_5rem_5rem_7rem] xl:gap-2";

// One field of a line: like the shared FormField, but its label is only read out, not
// shown, from `xl`, where the column headings above the lines say what each box is.
function LineField({
  control,
  name,
  label,
  className,
  children,
}: {
  control: Control<QuoteFormValues>;
  name: LineFieldName;
  label: string;
  className?: string;
  children: (props: LineControlProps) => ReactNode;
}) {
  const errorId = `${name}-error`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
          <label htmlFor={name} className="text-muted-foreground text-xs font-medium xl:sr-only">
            {label}
          </label>
          {children({
            ...field,
            id: name,
            "aria-invalid": fieldState.invalid,
            "aria-describedby": fieldState.invalid ? errorId : undefined,
          })}
          {fieldState.error?.message ? (
            <p id={errorId} className="text-destructive text-xs wrap-anywhere">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

// A button of a line. On a phone it is a labelled 40px button; from `md` it shrinks to an
// icon, and the words stay for screen readers.
function LineButton({
  id,
  label,
  icon,
  disabled,
  destructive,
  onClick,
}: {
  id?: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      id={id}
      type="button"
      variant="outline"
      title={label}
      disabled={disabled}
      className={cn(
        "h-10 px-3 md:size-9 md:px-0",
        destructive && "text-destructive hover:text-destructive",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="md:sr-only">{label}</span>
    </Button>
  );
}

// The product a line was made from, or "Choose a product" for a line typed by hand.
function LineProduct({
  control,
  index,
  onPick,
}: {
  control: Control<QuoteFormValues>;
  index: number;
  onPick: (picked: PickedRecord | null) => void;
}) {
  const [productId, productName] = useWatch({
    control,
    name: [lineField(index, "productId"), lineField(index, "productName")],
  });
  return (
    <ProductPicker
      value={productId ? { id: productId, name: productName } : null}
      onChange={onPick}
    />
  );
}

// The lines of the quote editor: add, remove and reorder with buttons (keyboard and finger;
// there is no dragging), and per line a catalog product or free text. Picking a product
// copies its name, price and tax rate into the line's own boxes, which stay editable: the
// line then stands on its own, as it does in the API.
export function QuoteLineItems({
  control,
  setValue,
  lineTotals,
  defaultTaxRate,
}: {
  control: Control<QuoteFormValues>;
  setValue: UseFormSetValue<QuoteFormValues>;
  // The live total of each line, from computeTotals.
  lineTotals: number[];
  // The organisation's default tax rate: what a new line and a product without a rate get.
  defaultTaxRate: number;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "lines" });
  // The line whose move button was pressed, so the focus can follow it to its new place.
  const moved = useRef<{ key: string; direction: "up" | "down" } | null>(null);
  // Where each line is now, for an answer that arrives after the lines were moved.
  const keys = useRef<string[]>([]);
  useEffect(() => {
    keys.current = fields.map((field) => field.id);
  }, [fields]);

  useEffect(() => {
    if (!moved.current) {
      return;
    }
    const { key, direction } = moved.current;
    moved.current = null;
    const other = direction === "up" ? "down" : "up";
    const pressed = document.getElementById(`move-${direction}-${key}`);
    // At the end of the list the button that was pressed is switched off: use its neighbour.
    const target =
      pressed instanceof HTMLButtonElement && pressed.disabled
        ? document.getElementById(`move-${other}-${key}`)
        : pressed;
    target?.focus();
  });

  function moveLine(index: number, direction: "up" | "down") {
    const key = fields[index]?.id;
    if (key) {
      moved.current = { key, direction };
    }
    move(index, direction === "up" ? index - 1 : index + 1);
  }

  async function pickProduct(key: string, picked: PickedRecord | null) {
    const at = () => keys.current.indexOf(key);
    if (!picked) {
      // Back to free text: what is in the line's boxes stays.
      setValue(lineField(at(), "productId"), "", { shouldDirty: true });
      setValue(lineField(at(), "productName"), "");
      return;
    }
    try {
      const product = await getProduct(picked.id);
      const index = at();
      if (index === -1) {
        return;
      }
      const options = { shouldDirty: true, shouldValidate: true };
      setValue(lineField(index, "productId"), product.id, { shouldDirty: true });
      setValue(lineField(index, "productName"), product.name);
      setValue(lineField(index, "description"), product.name, options);
      setValue(lineField(index, "unitPrice"), product.unitPrice.toFixed(2), options);
      // A product without a tax rate of its own takes the organisation's default.
      setValue(lineField(index, "taxRate"), String(product.taxRate ?? defaultTaxRate), options);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      toast.error(`The product could not be loaded. ${describeApiError(error as ApiError)}`);
    }
  }

  const full = fields.length >= MAX_QUOTE_LINES;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No lines yet. A quote needs at least one line before it can be sent or accepted.
        </p>
      ) : (
        <div
          aria-hidden
          className={cn(
            ROW_GRID,
            "text-muted-foreground hidden border-b pb-2 text-xs font-medium tracking-wide uppercase xl:grid",
          )}
        >
          <span>Product and description</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span>Disc. %</span>
          <span>Tax %</span>
          <span className="text-right">Line total</span>
        </div>
      )}

      {fields.map((field, index) => (
        <div
          key={field.id}
          role="group"
          aria-label={`Line ${String(index + 1)}`}
          className={cn(
            ROW_GRID,
            "min-w-0 rounded-lg border p-3 xl:rounded-none xl:border-0 xl:border-b xl:px-0 xl:pt-1 xl:pb-3",
          )}
        >
          <div className="col-span-2 flex min-w-0 flex-col gap-2 md:col-span-5 xl:col-span-1">
            <p className="text-sm font-medium xl:hidden">Line {index + 1}</p>
            <LineProduct
              control={control}
              index={index}
              onPick={(picked) => void pickProduct(field.id, picked)}
            />
            <LineField control={control} name={lineField(index, "description")} label="Description">
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  maxLength={500}
                  placeholder="What is being sold"
                  className="min-h-10 wrap-anywhere"
                />
              )}
            </LineField>
          </div>
          <LineField control={control} name={lineField(index, "quantity")} label="Quantity">
            {(props) => (
              <Input {...props} inputMode="decimal" autoComplete="off" className="h-10" />
            )}
          </LineField>
          <LineField
            control={control}
            name={lineField(index, "unitPrice")}
            label="Unit price (USD)"
          >
            {(props) => (
              <Input {...props} inputMode="decimal" autoComplete="off" className="h-10" />
            )}
          </LineField>
          <LineField
            control={control}
            name={lineField(index, "discountPercent")}
            label="Discount %"
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                className="h-10"
              />
            )}
          </LineField>
          <LineField control={control} name={lineField(index, "taxRate")} label="Tax %">
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                className="h-10"
              />
            )}
          </LineField>
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
            <span className="text-muted-foreground text-xs font-medium xl:sr-only">Line total</span>
            <output
              aria-label={`Line ${String(index + 1)} total`}
              className="flex h-10 items-center text-sm font-medium tabular-nums xl:justify-end"
            >
              {formatMoney(lineTotals[index] ?? 0)}
            </output>
          </div>
          <div className="col-span-2 flex flex-wrap gap-2 md:col-span-5 xl:col-span-6">
            <LineButton
              id={`move-up-${field.id}`}
              label="Move up"
              icon={<ArrowUp aria-hidden />}
              disabled={index === 0}
              onClick={() => {
                moveLine(index, "up");
              }}
            />
            <LineButton
              id={`move-down-${field.id}`}
              label="Move down"
              icon={<ArrowDown aria-hidden />}
              disabled={index === fields.length - 1}
              onClick={() => {
                moveLine(index, "down");
              }}
            />
            <LineButton
              label="Remove"
              icon={<Trash2 aria-hidden />}
              destructive
              onClick={() => {
                remove(index);
              }}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4 max-sm:w-full"
          disabled={full}
          onClick={() => {
            append(emptyLine(defaultTaxRate));
          }}
        >
          <Plus aria-hidden />
          Add line
        </Button>
        <p className="text-muted-foreground text-xs">
          {full
            ? `A quote holds at most ${String(MAX_QUOTE_LINES)} lines.`
            : "Choose a product from the catalog, or type a line of your own."}
        </p>
      </div>
    </div>
  );
}
