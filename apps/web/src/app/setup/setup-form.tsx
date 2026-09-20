"use client";

import { useActionState, useEffect, useState } from "react";
import { useNoResetForm } from "@/lib/use-no-reset-form";
import { setupAction, type SetupState } from "./actions";

const CURRENCIES = ["TTD", "USD", "EUR", "GBP", "CAD", "JMD", "BBD", "GYD", "XCD", "AUD", "NZD", "ZAR", "INR"];

export function SetupForm({ requireCode }: { requireCode: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAction, {});
  const formProps = useNoResetForm(action, state);
  const [timezone, setTimezone] = useState("");
  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  return (
    <form {...formProps} className="space-y-4">
      {requireCode && (
      <div>
        <label htmlFor="setupCode" className="mb-1 block text-sm font-medium">Setup code</label>
        <input id="setupCode" name="setupCode" required className="input font-mono uppercase" placeholder="XXXX-XXXX" autoComplete="off" />
        <p className="mt-1 text-xs text-neutral-500">
          Printed in the server log. Run <code>docker compose logs migrate</code> (or <code>logs app</code>) to see it. This stops a stranger claiming a new server.
        </p>
      </div>
      )}
      <div>
        <label htmlFor="storeName" className="mb-1 block text-sm font-medium">Business name</label>
        <input id="storeName" name="storeName" required className="input" placeholder="Island Gear Rentals" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="currency" className="mb-1 block text-sm font-medium">Currency</label>
          <select id="currency" name="currency" defaultValue="USD" className="input">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="timezone" className="mb-1 block text-sm font-medium">Time zone</label>
          <input id="timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required className="input" />
        </div>
      </div>
      <hr className="border-neutral-200" />
      <p className="text-sm text-neutral-500">Your owner account:</p>
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Your name</label>
        <input id="name" name="name" required className="input" autoComplete="name" />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password (12+ characters)</label>
        <input id="password" name="password" type="password" required minLength={12} className="input" autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">Repeat password</label>
        <input id="confirm" name="confirm" type="password" required minLength={12} className="input" autoComplete="new-password" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="demo" className="mt-1" />
        <span>
          Fill it with sample data so I can look around
          <span className="block text-xs text-neutral-500">A made-up rental business. Skip this if you will restore a backup or import your own.</span>
        </span>
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Setting up..." : "Create my account"}
      </button>
    </form>
  );
}
