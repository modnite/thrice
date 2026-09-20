"use client";

import { useActionState, type ReactNode } from "react";
import { useCurrencySymbol } from "@/components/currency";
import {
  addVariantAction,
  createCategoryAction,
  createProductAction,
  deleteProductAction,
  deleteVariantAction,
  updateProductAction,
  type CatalogState,
} from "./actions";

import { useNoResetForm } from "@/lib/use-no-reset-form";

const initial: CatalogState = {};

function Feedback({ state }: { state: CatalogState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.saved) return <p className="text-sm text-green-700">Saved.</p>;
  return null;
}

export function NewProductForm({ skus }: { skus: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createProductAction, initial);
  const formProps = useNoResetForm(action, state, false);
  return (
    <form {...formProps} className="card space-y-3">
      <h2 className="font-semibold">New product</h2>
      <input name="name" placeholder="Product name" required className="input" />
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Inventory (SKU) it books out (optional, can be added later)</span>
        <select name="skuId" className="input" defaultValue="">
          <option value="">No SKU yet</option>
          {skus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Creating..." : "Create product"}
      </button>
    </form>
  );
}

export function ProductForm({
  productId,
  product,
  categories,
  selectedCategoryIds,
}: {
  productId: string;
  product: { name: string; status: "PUBLIC" | "HIDDEN"; deposit: string; taxPercentage: string; tags: string };
  categories: { id: string; name: string }[];
  selectedCategoryIds: string[];
}) {
  const sym = useCurrencySymbol();
  const [state, action, pending] = useActionState(updateProductAction.bind(null, productId), initial);
  const formProps = useNoResetForm(action, state, false);
  return (
    <form {...formProps} className="card max-w-2xl space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Name</span>
        <input name="name" defaultValue={product.name} required className="input" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Visibility</span>
        <select name="status" defaultValue={product.status} className="input">
          <option value="PUBLIC">Public (bookable)</option>
          <option value="HIDDEN">Hidden</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Security deposit ({sym})</span>
          <input name="deposit" type="number" min={0} step="0.01" defaultValue={product.deposit} className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Tax %</span>
          <input name="taxPercentage" type="number" min={0} max={100} step="0.01" defaultValue={product.taxPercentage} className="input" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Tags (comma separated)</span>
        <input name="tags" defaultValue={product.tags} className="input" />
      </label>
      <fieldset className="text-sm">
        <legend className="mb-1 text-neutral-500">Categories</legend>
        <div className="grid grid-cols-2 gap-1">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={selectedCategoryIds.includes(c.id)} />
              {c.name}
            </label>
          ))}
          {categories.length === 0 && <p className="text-neutral-400">No categories yet.</p>}
        </div>
      </fieldset>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

export function AddVariantForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(addVariantAction.bind(null, productId), initial);
  const formProps = useNoResetForm(action, state, true);
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-2">
      <input name="name" placeholder="New variant name (e.g. Kit with case)" required className="input max-w-xs" />
      <button type="submit" disabled={pending} className="btn">
        Add variant
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteVariantButton({ variantId }: { variantId: string }) {
  const [state, action, pending] = useActionState(deleteVariantAction.bind(null, variantId), initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this variant and its rates?")) e.preventDefault();
      }}
      className="inline"
    >
      <button type="submit" disabled={pending} className="text-xs text-red-600 hover:underline">
        Delete variant
      </button>
      {state.error && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function DeleteProductForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(deleteProductAction.bind(null, productId), initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this product permanently?")) e.preventDefault();
      }}
      className="card max-w-2xl space-y-2"
    >
      <h2 className="font-semibold text-red-700">Delete product</h2>
      <p className="text-sm text-neutral-600">
        Removes the product, its variants and rates. Products that appear on any booking can only be hidden, never deleted.
      </p>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
        Delete product
      </button>
    </form>
  );
}

export function NewCategoryForm() {
  const [state, action, pending] = useActionState(createCategoryAction, initial);
  const formProps = useNoResetForm(action, state, true);
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-2">
      <input name="name" placeholder="New category name" required className="input max-w-xs" />
      <button type="submit" disabled={pending} className="btn-primary">
        Add category
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-neutral-600">{title}</h2>
      {children}
    </section>
  );
}
