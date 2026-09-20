"use client";

import { useActionState, useState } from "react";
import { useNoResetForm } from "@/lib/use-no-reset-form";
import { createApiKeyAction, saveAddressesAction, type AddressState, type CreateKeyState } from "./actions";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be refused (for example on plain http); the text is selectable as a fallback.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function AddressesForm({ publicUrl, websiteUrl, detected }: { publicUrl: string; websiteUrl: string; detected: string }) {
  const [state, action, pending] = useActionState<AddressState, FormData>(saveAddressesAction, {});
  const formProps = useNoResetForm(action, state);
  return (
    <form {...formProps} className="card max-w-2xl space-y-3">
      <h2 className="font-semibold">Addresses</h2>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">This THRICE&apos;s address</span>
        <input name="publicUrl" defaultValue={publicUrl} placeholder={detected || "https://admin.example.com"} className="input w-full" />
        <span className="mt-1 block text-xs text-neutral-500">
          Where your website reaches this THRICE from the internet. Leave it blank until you have one. Until then the address you are using right now
          {detected ? ` (${detected})` : ""} is offered in the snippets below.
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Customer website address</span>
        <input name="websiteUrl" defaultValue={websiteUrl} placeholder="https://www.example.com" className="input w-full" />
        <span className="mt-1 block text-xs text-neutral-500">Only used for reference and links here. Nothing calls it.</span>
      </label>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.saved && <p className="text-xs text-green-700">Saved.</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Save addresses"}
      </button>
    </form>
  );
}

export function CreateKeyForm() {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  const snippet = state.key ? `THRICE_API_URL=${state.url ?? ""}\nTHRICE_API_KEY=${state.key}` : "";
  return (
    <div className="space-y-3">
      <form action={action} className="card max-w-2xl space-y-3">
        <h2 className="font-semibold">Create an API key</h2>
        <div className="flex flex-wrap gap-2">
          <input name="name" placeholder="Name, for example Studio website" required maxLength={60} className="input min-w-0 flex-1" />
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Creating..." : "Create key"}
          </button>
        </div>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      </form>
      {state.key && (
        <div className="card max-w-2xl space-y-2 border-amber-400 bg-amber-50">
          <p className="text-sm font-medium">Key &ldquo;{state.name}&rdquo; created. Copy it now. It cannot be shown again.</p>
          <pre className="overflow-x-auto whitespace-pre rounded bg-white p-3 text-xs">{snippet}</pre>
          <div className="flex items-center gap-2">
            <CopyButton text={snippet} label="Copy settings" />
            <CopyButton text={state.key} label="Copy key only" />
          </div>
          {!state.url && <p className="text-xs text-amber-800">Set this THRICE&apos;s address above, then use it as THRICE_API_URL.</p>}
        </div>
      )}
    </div>
  );
}
