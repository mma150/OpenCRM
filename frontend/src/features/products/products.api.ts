import { http } from "@/lib/api/http";

import type {
  CreateProductInput,
  CreateProductResponse,
  Product,
  ProductList,
  ProductListQuery,
  ProductResponse,
  ProductsResponse,
  UpdateProductInput,
} from "./products.types";

// One page of the catalog. Every signed-in user may read it; the rest is for Admins.
export async function listProducts(query: ProductListQuery): Promise<ProductList> {
  const response = await http.get<ProductsResponse>("/products", { params: query });
  return { products: response.data.data, ...response.data.meta };
}

export async function getProduct(id: string): Promise<Product> {
  const response = await http.get<ProductResponse>(`/products/${id}`);
  return response.data.data;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const response = await http.post<CreateProductResponse>("/products", input);
  return response.data.data;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const response = await http.patch<ProductResponse>(`/products/${id}`, input);
  return response.data.data;
}

// An archived product cannot be added to a quote, and stays on the lines that have it.
export async function archiveProduct(id: string): Promise<Product> {
  const response = await http.post<ProductResponse>(`/products/${id}/archive`);
  return response.data.data;
}

export async function restoreProduct(id: string): Promise<Product> {
  const response = await http.post<ProductResponse>(`/products/${id}/restore`);
  return response.data.data;
}

// Only a product no quote line was ever made from; otherwise the API answers PRODUCT_IN_USE.
export async function deleteProduct(id: string): Promise<void> {
  await http.delete(`/products/${id}`);
}
