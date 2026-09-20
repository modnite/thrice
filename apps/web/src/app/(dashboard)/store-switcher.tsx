"use client";

import { switchStoreAction } from "./actions";

export function StoreSwitcher({
  memberships,
  currentStoreId,
}: {
  memberships: { storeId: string; storeName: string }[];
  currentStoreId: string;
}) {
  return (
    <form action={switchStoreAction} className="mb-6">
      <select
        name="storeId"
        defaultValue={currentStoreId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-lg border border-neutral-200 px-2 py-2 text-sm font-medium"
      >
        {memberships.map((m) => (
          <option key={m.storeId} value={m.storeId}>
            {m.storeName}
          </option>
        ))}
      </select>
    </form>
  );
}
