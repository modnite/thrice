"use client";

import { useState } from "react";

// "Products" filter pill: type to pick a product from the catalog; the form submits its id.
export function ProductPill({ products, selectedId }: { products: { id: string; name: string }[]; selectedId?: string }) {
  const selected = products.find((p) => p.id === selectedId);
  const [text, setText] = useState(selected?.name ?? "");
  const [id, setId] = useState(selectedId ?? "");

  return (
    <>
      <input type="hidden" name="product" value={id} />
      <input
        list="order-product-options"
        value={text}
        placeholder="Products"
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          const match = products.find((p) => p.name === value);
          setId(match?.id ?? "");
          // Picking a suggestion (or clearing) applies immediately.
          if (match || value === "") e.currentTarget.form?.requestSubmit();
        }}
        className={`w-52 rounded-md border px-3 py-1.5 text-sm ${id ? "border-brand bg-brand-light text-brand" : "border-neutral-300 bg-white"}`}
      />
      <datalist id="order-product-options">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
    </>
  );
}
