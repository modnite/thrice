"use client";

import { useActionState } from "react";
import { createCustomerAction, deleteCustomerAction, updateCustomerAction, type CustomerState } from "./actions";

type Values = { name: string; email: string; phone: string; company: string; notes: string };
import { useNoResetForm } from "@/lib/use-no-reset-form";

const initial: CustomerState = {};

function Fields({ v }: { v: Values }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Name</span>
          <input name="name" defaultValue={v.name} required className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Company</span>
          <input name="company" defaultValue={v.company} className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Email</span>
          <input name="email" type="email" defaultValue={v.email} className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Phone</span>
          <input name="phone" defaultValue={v.phone} className="input" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Notes</span>
        <textarea name="notes" defaultValue={v.notes} rows={3} className="input" />
      </label>
    </>
  );
}

export function NewCustomerForm() {
  const [state, action, pending] = useActionState(createCustomerAction, initial);
  const formProps = useNoResetForm(action, state, false);
  return (
    <form {...formProps} className="card max-w-2xl space-y-3">
      <h2 className="font-semibold">New customer</h2>
      <Fields v={{ name: "", email: "", phone: "", company: "", notes: "" }} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        Create customer
      </button>
    </form>
  );
}

export function EditCustomerForm({ customerId, values }: { customerId: string; values: Values }) {
  const [state, action, pending] = useActionState(updateCustomerAction.bind(null, customerId), initial);
  const formProps = useNoResetForm(action, state, false);
  return (
    <form {...formProps} className="card max-w-2xl space-y-3">
      <Fields v={values} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-700">Saved. Orders still in progress now use these details.</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

export function DeleteCustomerForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState(deleteCustomerAction.bind(null, customerId), initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this customer?")) e.preventDefault();
      }}
      className="mt-4"
    >
      <button type="submit" className="text-sm text-red-600 hover:underline">
        Delete customer
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
