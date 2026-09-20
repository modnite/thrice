"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Mail, MoreVertical, Plus, User } from "lucide-react";
import {
  addPersonAction,
  duplicateOrderAction,
  makeLiablePersonAction,
  removePersonAction,
  rescheduleOrderAction,
  sendConfirmationEmailAction,
  type EmailState,
  setReturnMethodAction,
  type FormState,
} from "./actions";

const initial: FormState = {};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Outlined "Duplicate order" button; navigates to the copy, or explains why it couldn't be made. */
export function DuplicateButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(duplicateOrderAction.bind(null, orderId), initial);
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Duplicating..." : "Duplicate order"}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

/** The "Select start date" field: opens a small popover to move an upcoming order. */
export function StartDatePicker({
  orderId,
  startISO,
  label,
  disabled,
}: {
  orderId: string;
  startISO: string;
  label: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(startISO));
  const [state, action, pending] = useActionState(rescheduleOrderAction.bind(null, orderId), initial);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div className="relative mt-3">
      <p className="text-[10px] text-neutral-500">Select start date</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-neutral-300 py-1 text-left text-[11px] disabled:text-neutral-400"
      >
        {label}
        <ChevronDown size={14} />
      </button>
      {open && !disabled && (
        <form
          action={(fd) => {
            fd.set("start", new Date(value).toISOString());
            action(fd);
          }}
          className="absolute left-0 right-0 z-20 mt-1 space-y-2 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-lg"
        >
          <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="input" />
          <label className="flex items-center gap-2 text-neutral-600">
            <input type="checkbox" name="allowOutsideHours" /> Allow outside opening hours
          </label>
          {state.error && <p className="text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-neutral-600">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="rounded bg-brand px-3 py-1 font-medium text-white">
              {pending ? "Moving..." : "Move order"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ReturnMethodSelect({ orderId, value, disabled }: { orderId: string; value: "STORE" | "PICKUP"; disabled: boolean }) {
  return (
    <form action={setReturnMethodAction.bind(null, orderId)} className="mt-3">
      <label className="text-[10px] text-neutral-500">Return</label>
      <select
        name="returnMethod"
        defaultValue={value}
        disabled={disabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="block w-full border-b border-neutral-300 bg-transparent py-1 text-[11px] disabled:text-neutral-400"
      >
        <option value="STORE">Return to store</option>
        <option value="PICKUP">Pickup</option>
      </select>
    </form>
  );
}

/** The plus button beside the person chips. */
export function AddPersonButton({ orderId, customers }: { orderId: string; customers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addPersonAction.bind(null, orderId), initial);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <>
      <button type="button" title="Add person" aria-label="Add person" onClick={() => setOpen(true)} className="rounded p-1 hover:bg-neutral-100">
        <Plus size={18} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="m-auto w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-brand px-6 py-4 text-lg font-semibold text-white">Add person</div>
            <form action={action} className="space-y-3 p-6 text-sm">
              <label className="block">
                <span className="text-xs text-neutral-500">Existing customer</span>
                <select name="customerId" className="input mt-1" defaultValue="">
                  <option value="">New customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-neutral-500">Or a new customer (used when no existing customer is chosen):</p>
              <input name="name" placeholder="Name" className="input" />
              <input name="email" type="email" placeholder="Email (optional)" className="input" />
              <input name="phone" placeholder="Phone (optional)" className="input" />
              {state.error && <p className="text-red-600">{state.error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-neutral-600">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
                  {pending ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** The kebab menu on a person card. */
export function PersonMenu({
  orderId,
  personId,
  isLiable,
  canRemove,
  disabled,
}: {
  orderId: string;
  personId: string;
  isLiable: boolean;
  canRemove: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label="Person menu" onClick={() => setOpen((o) => !o)} className="rounded p-1 text-neutral-600 hover:bg-neutral-100">
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setOpen(false)}>
          <form action={makeLiablePersonAction.bind(null, orderId, personId)}>
            <button type="submit" disabled={isLiable} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 disabled:text-neutral-400">
              <User size={14} /> {isLiable ? "Liable customer" : "Make liable customer"}
            </button>
          </form>
          <form action={removePersonAction.bind(null, orderId, personId)}>
            <button
              type="submit"
              disabled={!canRemove || disabled}
              title={canRemove ? undefined : "Remove their items first, and keep at least one person"}
              className="w-full px-3 py-2 text-left text-red-600 hover:bg-neutral-50 disabled:text-neutral-400"
            >
              Remove person
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** The mail icon: emails the confirmation and shows staff the outcome. */
export function EmailButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(sendConfirmationEmailAction.bind(null, orderId), {} as EmailState);
  return (
    <form action={action} className="relative">
      <button
        type="submit"
        disabled={pending}
        title="Email confirmation to customer"
        aria-label="Email confirmation to customer"
        className="rounded p-2 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
      >
        <Mail size={20} strokeWidth={1.75} />
      </button>
      {(state.error || state.message) && (
        <p
          role="status"
          className={`absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border bg-white p-2 text-xs shadow-lg ${state.error ? "border-red-200 text-red-700" : "border-green-200 text-green-700"}`}
        >
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}
