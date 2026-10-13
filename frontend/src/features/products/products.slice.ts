import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as productsApi from "./products.api";
import type {
  CreateProductInput,
  ProductList,
  ProductListQuery,
  UpdateProductInput,
} from "./products.types";

// The slice loads one thing: `list`, one page of the catalog, with the `query` (search,
// the Active / Archived filter, sort, page) it was asked for. The product picker of a
// quote searches the catalog itself and keeps its answers out of the store.
type ProductsState = {
  list: {
    data: ProductList | null;
    status: "idle" | "loading" | "succeeded" | "failed";
    error: ApiError | null;
    query: ProductListQuery | null;
  };
};

const initialState: ProductsState = {
  list: { data: null, status: "idle", error: null, query: null },
};

function sameQuery(a: ProductListQuery, b: ProductListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof ProductListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

export const fetchProducts = createAppThunk(
  "products/fetch",
  async (query: ProductListQuery, { rejectWithValue }) => {
    try {
      return await productsApi.listProducts(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed the filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().products;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

// Reloads the list with the query it was last loaded with, so a change shows where it
// belongs under the current filter and sort (an archived product leaves the Active list).
function reloadList(api: {
  dispatch: (action: ReturnType<typeof fetchProducts>) => unknown;
  getState: () => RootState;
}): void {
  const { query } = api.getState().products.list;
  if (query) {
    void api.dispatch(fetchProducts(query));
  }
}

// The thunks below are mutations (Admin only): a dialog or a menu dispatches one, awaits
// `.unwrap()` and shows the rejection itself, so they do not touch `status` or `error`.
// The returned product is put in the list at once, and the list is then reloaded.
export const createProduct = createAppThunk(
  "products/create",
  async (input: CreateProductInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const product = await productsApi.createProduct(input);
      reloadList({ dispatch, getState });
      return product;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateProduct = createAppThunk(
  "products/update",
  async (
    arg: { id: string; changes: UpdateProductInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const product = await productsApi.updateProduct(arg.id, arg.changes);
      reloadList({ dispatch, getState });
      return product;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const archiveProduct = createAppThunk(
  "products/archive",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const product = await productsApi.archiveProduct(id);
      reloadList({ dispatch, getState });
      return product;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const restoreProduct = createAppThunk(
  "products/restore",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const product = await productsApi.restoreProduct(id);
      reloadList({ dispatch, getState });
      return product;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteProduct = createAppThunk(
  "products/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await productsApi.deleteProduct(id);
      reloadList({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? {
            code: "UNKNOWN_ERROR",
            message: action.error.message ?? "Unexpected error",
            details: null,
          };
        }
      })
      .addCase(deleteProduct.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data.products = state.list.data.products.filter(
            (product) => product.id !== action.payload,
          );
        }
      })
      .addMatcher(
        isAnyOf(updateProduct.fulfilled, archiveProduct.fulfilled, restoreProduct.fulfilled),
        (state, action) => {
          const product = action.payload;
          const index = state.list.data?.products.findIndex(
            (existing) => existing.id === product.id,
          );
          if (state.list.data && index !== undefined && index !== -1) {
            state.list.data.products[index] = product;
          }
        },
      );
  },
});

export const productsReducer = productsSlice.reducer;

export const selectProductList = (state: RootState) => state.products.list;
