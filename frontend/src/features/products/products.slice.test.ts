import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as productsApi from "./products.api";
import { allProducts, defaultQuery, licence, productList, tracker } from "./products.fixtures";
import {
  archiveProduct,
  createProduct,
  deleteProduct,
  fetchProducts,
  restoreProduct,
  updateProduct,
} from "./products.slice";
import type { ProductList } from "./products.types";

vi.mock("./products.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };
const inUse: ApiError = { code: "PRODUCT_IN_USE", message: "Server text", details: null };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadedStore() {
  vi.mocked(productsApi.listProducts).mockResolvedValue(productList(allProducts));
  const store = makeStore();
  await store.dispatch(fetchProducts(defaultQuery));
  vi.mocked(productsApi.listProducts).mockClear();
  return store;
}

describe("products slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, no error and no query", () => {
    expect(makeStore().getState().products.list).toEqual({
      data: null,
      status: "idle",
      error: null,
      query: null,
    });
  });

  it("goes loading, then succeeded with the page and the query it was asked for", async () => {
    const request = deferred<ProductList>();
    vi.mocked(productsApi.listProducts).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchProducts(defaultQuery));
    expect(store.getState().products.list.status).toBe("loading");
    expect(store.getState().products.list.query).toEqual(defaultQuery);

    request.resolve(productList(allProducts));
    await pending;
    expect(store.getState().products.list).toEqual({
      data: productList(allProducts),
      status: "succeeded",
      error: null,
      query: defaultQuery,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(productsApi.listProducts).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchProducts(defaultQuery));

    expect(store.getState().products.list).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("starts no second request while the same query is loading", async () => {
    const request = deferred<ProductList>();
    vi.mocked(productsApi.listProducts).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchProducts(defaultQuery));
    const second = store.dispatch(fetchProducts({ ...defaultQuery }));
    request.resolve(productList(allProducts));
    await Promise.all([first, second]);

    expect(productsApi.listProducts).toHaveBeenCalledTimes(1);
  });

  it("lets a different query through and drops the older answer", async () => {
    const slow = deferred<ProductList>();
    const fast = deferred<ProductList>();
    vi.mocked(productsApi.listProducts)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = makeStore();
    const searched = { ...defaultQuery, search: "gps" };

    const first = store.dispatch(fetchProducts(defaultQuery));
    const second = store.dispatch(fetchProducts(searched));
    fast.resolve(productList([tracker]));
    await second;
    slow.resolve(productList(allProducts));
    await first;

    expect(productsApi.listProducts).toHaveBeenCalledTimes(2);
    expect(store.getState().products.list.data).toEqual(productList([tracker]));
    expect(store.getState().products.list.query).toEqual(searched);
    expect(store.getState().products.list.status).toBe("succeeded");
  });

  it("reloads the list with its last query after every change", async () => {
    const store = await loadedStore();
    vi.mocked(productsApi.listProducts).mockResolvedValue(productList(allProducts));
    vi.mocked(productsApi.createProduct).mockResolvedValue(tracker);
    vi.mocked(productsApi.updateProduct).mockResolvedValue({ ...licence, name: "Renamed" });
    vi.mocked(productsApi.archiveProduct).mockResolvedValue({ ...licence, active: false });
    vi.mocked(productsApi.restoreProduct).mockResolvedValue(licence);
    vi.mocked(productsApi.deleteProduct).mockResolvedValue();

    await store.dispatch(createProduct({ name: "GPS tracker hardware", unitPrice: 149.99 }));
    expect(productsApi.createProduct).toHaveBeenCalledWith({
      name: "GPS tracker hardware",
      unitPrice: 149.99,
    });
    await store.dispatch(updateProduct({ id: licence.id, changes: { name: "Renamed" } }));
    expect(productsApi.updateProduct).toHaveBeenCalledWith(licence.id, { name: "Renamed" });
    await store.dispatch(archiveProduct(licence.id));
    expect(productsApi.archiveProduct).toHaveBeenCalledWith(licence.id);
    await store.dispatch(restoreProduct(licence.id));
    expect(productsApi.restoreProduct).toHaveBeenCalledWith(licence.id);
    await store.dispatch(deleteProduct(licence.id));
    expect(productsApi.deleteProduct).toHaveBeenCalledWith(licence.id);

    expect(productsApi.listProducts).toHaveBeenCalledTimes(5);
    expect(productsApi.listProducts).toHaveBeenLastCalledWith(defaultQuery);
  });

  it("shows a changed product at once, before the reload answers", async () => {
    const store = await loadedStore();
    const reload = deferred<ProductList>();
    vi.mocked(productsApi.listProducts).mockReturnValue(reload.promise);
    vi.mocked(productsApi.archiveProduct).mockResolvedValue({ ...licence, active: false });
    vi.mocked(productsApi.deleteProduct).mockResolvedValue();

    await store.dispatch(archiveProduct(licence.id));
    expect(store.getState().products.list.data?.products[0]).toEqual({ ...licence, active: false });

    await store.dispatch(deleteProduct(tracker.id));
    expect(
      store.getState().products.list.data?.products.map((product) => product.id),
    ).not.toContain(tracker.id);
    reload.resolve(productList(allProducts));
  });

  it("leaves the list alone when a change is refused, and hands over the error", async () => {
    const store = await loadedStore();
    vi.mocked(productsApi.deleteProduct).mockRejectedValue(inUse);

    const result = await store.dispatch(deleteProduct(licence.id));

    expect(result.payload).toEqual(inUse);
    expect(productsApi.listProducts).not.toHaveBeenCalled();
    expect(store.getState().products.list).toEqual({
      data: productList(allProducts),
      status: "succeeded",
      error: null,
      query: defaultQuery,
    });
  });
});
