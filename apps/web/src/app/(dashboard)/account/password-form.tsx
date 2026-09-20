"use client";

import { useNoResetForm } from "@/lib/use-no-reset-form";
import { useActionState } from "react";
import { changePasswordAction, type AccountState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(changePasswordAction, {});
  const formProps = useNoResetForm(action, state, true);
  return (
    <form {...formProps} className="card max-w-xl space-y-4">
      <h2 className="font-semibold">Change password</h2>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Current password</span>
        <input name="current" type="password" autoComplete="current-password" required className="input" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">New password (at least 12 characters)</span>
        <input name="next" type="password" autoComplete="new-password" minLength={12} required className="input" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">Repeat new password</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required className="input" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
