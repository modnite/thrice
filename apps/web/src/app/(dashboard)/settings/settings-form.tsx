"use client";

import { useNoResetForm } from "@/lib/use-no-reset-form";
import { useActionState, useState } from "react";
import { WEEKDAY_LABELS, type HolidaysConfig, type OpeningHours } from "@thrice/shared/store-hours";
import type { PaymentMethodOption } from "@thrice/shared/payment-methods";
import { HolidaysEditor } from "./holidays-editor";
import { PaymentMethodsEditor } from "./payment-methods-editor";
import { saveStoreSettingsAction, type SettingsState } from "./actions";

type Store = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  emailSubject: string | null;
  emailIntro: string | null;
  emailFooter: string | null;
  sendConfirmationOnCreate: boolean;
};

/** Fills the day rows below in one go, for the common "weekdays like this, weekends like that" week. */
function QuickFill({ label, days, defaults }: { label: string; days: number[]; defaults: [string, string] }) {
  const [open, setOpen] = useState(defaults[0]);
  const [close, setClose] = useState(defaults[1]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 text-neutral-500">{label}</span>
      <input type="time" value={open} onChange={(e) => setOpen(e.target.value)} className="input w-28" />
      <span>-</span>
      <input type="time" value={close} onChange={(e) => setClose(e.target.value)} className="input w-28" />
      <button
        type="button"
        className="btn"
        onClick={(e) => {
          const form = e.currentTarget.closest("form");
          if (!form) return;
          for (const d of days) {
            (form.elements.namedItem(`open-${d}`) as HTMLInputElement | null)!.value = open;
            (form.elements.namedItem(`close-${d}`) as HTMLInputElement | null)!.value = close;
            (form.elements.namedItem(`closed-${d}`) as HTMLInputElement | null)!.checked = false;
          }
        }}
      >
        Apply
      </button>
    </div>
  );
}

export function SettingsForm({
  store,
  openingHours,
  holidays,
  paymentMethods,
  currency,
}: {
  store: Store;
  openingHours: OpeningHours | null;
  holidays: HolidaysConfig | null;
  paymentMethods: PaymentMethodOption[];
  currency: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveStoreSettingsAction, {});
  const formProps = useNoResetForm(action, state, false);
  const [restrict, setRestrict] = useState(openingHours !== null);

  return (
    <form {...formProps} className="max-w-2xl space-y-8">
      <section className="card space-y-4">
        <h2 className="font-semibold">Store details</h2>
        <p className="text-xs text-neutral-500">Shown on printed invoices and confirmation emails.</p>
        {(
          [
            ["name", "Store name", store.name],
            ["tagline", "Tagline", store.tagline],
            ["address", "Address", store.address],
            ["phone", "Phone", store.phone],
            ["email", "Email", store.email],
          ] as const
        ).map(([key, label, value]) => (
          <label key={key} className="block text-sm">
            <span className="mb-1 block text-neutral-500">{label}</span>
            <input name={key} defaultValue={value ?? ""} className="input" />
          </label>
        ))}
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Opening hours</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="restrictHours" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />
          Only allow pickup and return during opening hours
        </label>
        {restrict && (
          <div className="space-y-2">
            <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
              <p className="text-xs text-neutral-500">Quick fill</p>
              <QuickFill label="Mon to Fri" days={[1, 2, 3, 4, 5]} defaults={["08:00", "16:00"]} />
              <QuickFill label="Sat and Sun" days={[0, 6]} defaults={["08:00", "13:00"]} />
            </div>
            {WEEKDAY_LABELS.map((label, d) => {
              const day = openingHours?.[String(d)];
              const closedByDefault = openingHours ? day === null : false;
              return (
                <div key={d} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="w-24">{label}</span>
                  <input type="time" name={`open-${d}`} defaultValue={day?.open ?? "09:00"} className="input w-28" />
                  <span>-</span>
                  <input type="time" name={`close-${d}`} defaultValue={day?.close ?? "17:00"} className="input w-28" />
                  <label className="flex items-center gap-1 text-neutral-500">
                    <input type="checkbox" name={`closed-${d}`} defaultChecked={closedByDefault} />
                    Closed
                  </label>
                </div>
              );
            })}
            <p className="text-xs text-neutral-500">
              Times are in the store timezone. Staff can still override when creating an order.
            </p>
            <HolidaysEditor initial={holidays} />
          </div>
        )}
      </section>

      <PaymentMethodsEditor initial={paymentMethods} currency={currency} />

      <section className="card space-y-4">
        <h2 className="font-semibold">Confirmation email</h2>
        <p className="text-xs text-neutral-500">
          Your own wording for the order confirmation. You can use {"{{customer}}"}, {"{{orderNumber}}"} and {"{{storeName}}"}.
          Leave a field empty to use the default. Sending needs a mail server, which you set under Integrations.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Subject</span>
          <input name="emailSubject" defaultValue={store.emailSubject ?? ""} placeholder="{{storeName}} - Order #{{orderNumber}} confirmation" className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Message</span>
          <textarea name="emailIntro" defaultValue={store.emailIntro ?? ""} rows={3} placeholder="Thank you for booking with {{storeName}}." className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Footer (pickup instructions, terms, contact)</span>
          <textarea name="emailFooter" defaultValue={store.emailFooter ?? ""} rows={3} className="input" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendConfirmationOnCreate" defaultChecked={store.sendConfirmationOnCreate} />
          Email the confirmation automatically when an order is created
        </label>
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-700">Settings saved.</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
