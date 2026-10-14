"use client";

import { Archive, ArchiveRestore, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ListActions } from "@/components/shared/list-actions";
import { ListToolbar } from "@/components/shared/list-toolbar";
import {
  type ListUrlConfig,
  type SortOrder,
  useListUrlState,
} from "@/components/shared/list-url-state";
import { PageHeader } from "@/components/shared/page-header";
import { RecordList } from "@/components/shared/record-list";
import type { ListColumn } from "@/components/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectAuth } from "@/features/auth/auth.slice";
import { useOrganization } from "@/features/organization/use-organization";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { formatMoney } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { type ProductDialog, ProductDialogs } from "./product-dialogs";
import { canManageProducts, taxRateLabel } from "./product-labels";
import { exportProducts } from "./products.api";
import { archiveProduct, fetchProducts, restoreProduct, selectProductList } from "./products.slice";
import type { Product, ProductListQuery, ProductSort } from "./products.types";

const PAGE_SIZE = 25;

// What the list keeps in the address: /settings/products?search=gps&status=archived&sort=unitPrice&order=desc
// The plain address lists the products in use (the API's `active=true`), because that is the
// catalog a quote can use; `status=archived` lists the archived ones (`active=false`) and
// `status=any` both (no `active` at all).
const LIST_URL: ListUrlConfig<"status", ProductSort> = {
  filters: { status: ["archived", "any"] },
  sorts: ["name", "sku", "unitPrice", "createdAt"],
  defaultSort: "name",
  defaultOrder: "asc",
};

const statusOptions = [
  { value: "archived", label: "Archived" },
  { value: "any", label: "Active and archived" },
];

const sortOptions = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "sku:asc", label: "SKU A–Z" },
  { value: "unitPrice:asc", label: "Price: low to high" },
  { value: "unitPrice:desc", label: "Price: high to low" },
  { value: "createdAt:desc", label: "Newest first" },
];

function ArchivedBadge() {
  return <Badge variant="outline">Archived</Badge>;
}

// The name with the description under it. Both wrap: a product name can be 200 characters.
function NameCell({ product, skuOnTablet }: { product: Product; skuOnTablet?: boolean }) {
  return (
    <div className="min-w-0 whitespace-normal">
      <p className="font-medium wrap-anywhere">{product.name}</p>
      {/* A tablet's table has no room for the SKU column, so the SKU sits under the name. */}
      {skuOnTablet && product.sku ? (
        <p className="lg:hidden">
          <Sku sku={product.sku} />
        </p>
      ) : null}
      {product.description ? (
        <p className="text-muted-foreground line-clamp-4 text-xs wrap-anywhere">
          {product.description}
        </p>
      ) : null}
    </div>
  );
}

function Sku({ sku }: { sku: string | null }) {
  return sku ? (
    <span className="font-mono text-xs wrap-anywhere whitespace-normal">{sku}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

// The same product as a stacked card, for phones.
function ProductCard({
  product,
  defaultTaxRate,
}: {
  product: Product;
  defaultTaxRate: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <NameCell product={product} />
      {product.active ? null : (
        <div className="flex">
          <ArchivedBadge />
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Unit price</dt>
          <dd className="text-sm font-medium">{formatMoney(product.unitPrice)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Tax rate</dt>
          <dd className="text-sm">{taxRateLabel(product, defaultTaxRate)}</dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-muted-foreground">SKU</dt>
          <dd>
            <Sku sku={product.sku} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

// The menu of a row, for an Admin: Edit, Archive or Restore, and Delete.
function ProductRowMenu({
  product,
  onEdit,
  onToggleArchived,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onToggleArchived: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-11 md:size-9"
          aria-label={`Actions for ${product.name}`}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleArchived}>
          {product.active ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
          {product.active ? "Archive" : "Restore"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// /settings/products (QUOT-01): the catalog a quote's lines are made from. Every role may
// read it; only an Admin gets the controls, and the API refuses everyone else too.
export function ProductsPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectProductList);
  const { data: organization } = useOrganization();
  const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const [dialog, setDialog] = useState<ProductDialog>(null);
  const defaultTaxRate = organization ? organization.defaultTaxRate : null;

  const query = useMemo<ProductListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.status === "" ? { active: "true" as const } : {}),
      ...(state.filters.status === "archived" ? { active: "false" as const } : {}),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  useEffect(() => {
    void dispatch(fetchProducts(query));
  }, [dispatch, query]);

  const columns = useMemo<ListColumn<Product>[]>(
    () => [
      { header: "Name", cell: (product) => <NameCell product={product} skuOnTablet /> },
      {
        header: "SKU",
        className: "w-36",
        hideBelow: "lg",
        cell: (product) => <Sku sku={product.sku} />,
      },
      {
        header: "Unit price",
        className: "w-32",
        cell: (product) => formatMoney(product.unitPrice),
      },
      {
        header: "Tax rate",
        className: "w-36",
        cell: (product) => (
          <span className="whitespace-normal">{taxRateLabel(product, defaultTaxRate)}</span>
        ),
      },
      {
        header: "Status",
        className: "w-28",
        cell: (product) =>
          product.active ? (
            <span className="text-muted-foreground">Active</span>
          ) : (
            <ArchivedBadge />
          ),
      },
    ],
    [defaultTaxRate],
  );

  if (!me) {
    return null;
  }
  const canManage = canManageProducts(me.role);

  // Archiving can be undone with Restore, so neither asks first.
  async function toggleArchived(product: Product) {
    try {
      if (product.active) {
        await dispatch(archiveProduct(product.id)).unwrap();
        toast.success(`${product.name} was archived.`);
      } else {
        await dispatch(restoreProduct(product.id)).unwrap();
        toast.success(`${product.name} was restored.`);
      }
    } catch (caught) {
      toast.error(
        `${product.name} could not be ${product.active ? "archived" : "restored"}. ${describeApiError(caught as ApiError)}`,
      );
    }
  }

  const newProductButton = (
    <Button
      type="button"
      className="h-10 px-4"
      onClick={() => {
        setDialog({ kind: "add" });
      }}
    >
      <Plus aria-hidden />
      New product
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Products"
        description={
          canManage
            ? "The catalog a quote's lines are made from. Archive a product to stop offering it."
            : "The catalog a quote's lines are made from. Only an Admin can change it."
        }
        action={
          <>
            <ListActions onExport={() => exportProducts(query)} />
            {canManage ? newProductButton : null}
          </>
        }
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by name or SKU",
          maxLength: 100,
          onChange: setSearch,
        }}
        filters={[
          {
            label: "Status",
            // "Off" is the default: the products in use.
            allLabel: "Active",
            value: state.filters.status,
            options: statusOptions,
            onChange: (value) => {
              setFilter("status", value);
            },
          },
        ]}
        sort={{
          value: `${state.sort}:${state.order}`,
          options: sortOptions,
          onChange: (value) => {
            const [sort, order] = value.split(":");
            setSort(sort as ProductSort, order as SortOrder);
          },
        }}
      />

      <RecordList
        label="Products"
        plural="products"
        items={data?.products ?? null}
        meta={data}
        status={status}
        error={error}
        getKey={(product) => product.id}
        columns={columns}
        renderCard={(product) => <ProductCard product={product} defaultTaxRate={defaultTaxRate} />}
        rowActions={(product) =>
          canManage ? (
            <ProductRowMenu
              product={product}
              onEdit={() => {
                setDialog({ kind: "edit", product });
              }}
              onToggleArchived={() => void toggleArchived(product)}
              onDelete={() => {
                setDialog({ kind: "delete", product });
              }}
            />
          ) : null
        }
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={
          canManage
            ? "Add what you sell, then pick it on a quote. Archived products are under the Status filter."
            : "Products will show here once an Admin adds them."
        }
        createAction={canManage ? newProductButton : undefined}
        page={state.page}
        onPageChange={setPage}
        onRetry={() => void dispatch(fetchProducts(query))}
      />

      <ProductDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}
