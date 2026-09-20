"use client";

import { useState, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import type { PaymentMethodOption } from "@thrice/shared/payment-methods";
import { setPaymentMethodAction, updateOrderNotesAction } from "./actions";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4 print:hidden" onClick={onClose}>
      <div className="m-auto w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-brand px-6 py-4 text-lg font-semibold text-white">{title}</div>
        {children}
      </div>
    </div>
  );
}

// The comment icon (green dot when a staff comment exists) and its "Comments" dialog.
export function NotesDialog({ orderId, notes, className }: { orderId: string; notes: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="Comments"
        aria-label="Comments"
        onClick={() => setOpen(true)}
        className={`relative ${className ?? "rounded p-2 text-neutral-700 hover:bg-neutral-100"}`}
      >
        <MessageSquare size={20} strokeWidth={1.75} />
        {notes && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-500" />}
      </button>
      {open && (
        <Modal title="Comments" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              await updateOrderNotesAction(orderId, fd);
              setOpen(false);
            }}
            className="space-y-4 p-6"
          >
            <label className="block">
              <span className="text-xs text-neutral-500">Staff comment</span>
              <textarea name="notes" defaultValue={notes ?? ""} rows={4} maxLength={2000} className="input mt-1" autoFocus />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-neutral-600">
                Cancel
              </button>
              <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// The underlined method link next to Paid/Unpaid, opening "Select payment method".
export function PaymentMethodDialog({
  orderId,
  method,
  reference,
  methods,
}: {
  orderId: string;
  method: string | null;
  reference: string | null;
  methods: PaymentMethodOption[];
}) {
  const [open, setOpen] = useState(false);
  const shown = methods.filter((m) => m.enabled);
  // An order can keep a method the store has since hidden or removed; show it so it isn't silently lost.
  const legacy = method && !shown.some((m) => m.label === method) ? method : null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium uppercase text-brand underline">
        {method ?? "Select method"}
      </button>
      {open && (
        <Modal title="Select payment method" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              await setPaymentMethodAction(orderId, fd);
              setOpen(false);
            }}
            className="space-y-4 p-6 text-sm"
          >
            {shown.map((m) => (
              <label key={m.id} className="flex items-start gap-3">
                <input type="radio" name="method" value={m.label} defaultChecked={method === m.label} className="mt-1" />
                <span>
                  <span className="block">{m.label}</span>
                  {m.description && <span className="block whitespace-pre-line text-xs text-neutral-500">{m.description}</span>}
                </span>
              </label>
            ))}
            {legacy && (
              <label className="flex items-start gap-3">
                <input type="radio" name="method" value={legacy} defaultChecked className="mt-1" />
                <span>
                  <span className="block">{legacy}</span>
                  <span className="block text-xs text-neutral-500">No longer offered in Settings</span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-3">
              <input type="radio" name="method" value="" defaultChecked={!method} className="mt-1" />
              <span className="text-neutral-500">Not recorded</span>
            </label>
            {shown.length === 0 && !legacy && (
              <p className="text-xs text-neutral-500">No payment options are shown. Add or show some under Settings.</p>
            )}
            <label className="block">
              <span className="text-xs text-neutral-500">Reference (receipt number or transaction ID, optional)</span>
              <input name="reference" defaultValue={reference ?? ""} maxLength={120} className="input mt-1" />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-neutral-600">
                Cancel
              </button>
              <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
