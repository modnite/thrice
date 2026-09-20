"use client";

import { useActionState } from "react";
import { addArticleAction, deleteArticleAction, setArticleStatusAction, type StockState } from "./actions";
import { useCurrencySymbol } from "@/components/currency";

export function ArticleStatusSelect({ articleId, status }: { articleId: string; status: "IN_USE" | "OUT_OF_USE" | "LOST" }) {
  return (
    <form action={setArticleStatusAction.bind(null, articleId)}>
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${
          status === "IN_USE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}
      >
        <option value="IN_USE">In use</option>
        <option value="OUT_OF_USE">Out of use</option>
        <option value="LOST">Lost</option>
      </select>
    </form>
  );
}

export function DeleteArticleButton({ articleId }: { articleId: string }) {
  return (
    <form
      action={deleteArticleAction.bind(null, articleId)}
      onSubmit={(e) => {
        if (!confirm("Delete this stock item? This can't be undone.")) e.preventDefault();
      }}
    >
      <button type="submit" className="text-xs text-red-600 hover:underline">
        Delete
      </button>
    </form>
  );
}

import { useNoResetForm } from "@/lib/use-no-reset-form";

const initial: StockState = {};

export function AddStockItemForm({ skus }: { skus: { id: string; label: string; tracked: boolean }[] }) {
  const sym = useCurrencySymbol();
  const [state, action, pending] = useActionState(addArticleAction, initial);
  const formProps = useNoResetForm(action, state, true);
  return (
    <form {...formProps} className="card mb-6 max-w-3xl space-y-3">
      <h2 className="font-semibold">Add stock item</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="skuId" required defaultValue="" className="input sm:col-span-2">
          <option value="" disabled>
            Choose a SKU...
          </option>
          {skus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} {s.tracked ? "(serial tracked)" : "(bulk)"}
            </option>
          ))}
        </select>
        <input name="articleCode" placeholder="Serial / article ID (required for serial-tracked SKUs)" className="input" />
        <input name="quantity" type="number" min={1} defaultValue={1} placeholder="Quantity (bulk SKUs)" className="input" />
        <input name="purchaseDate" type="date" className="input" />
        <input name="purchasePrice" type="number" min={0} step="0.01" placeholder={`Purchase price (${sym})`} className="input" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-700">Stock item added.</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Adding..." : "Add stock item"}
      </button>
    </form>
  );
}
