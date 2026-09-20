"use client";

import { useActionState, useState } from "react";
import { useNoResetForm } from "@/lib/use-no-reset-form";
import { clearEmailSettingsAction, saveEmailSettingsAction, sendTestEmailAction, type EmailState } from "./email-actions";

type Initial = { host: string; port: number; secure: boolean; user: string; from: string; hasPassword: boolean };

const PRESETS: { label: string; host: string; port: number; ssl: boolean; note: string }[] = [
  { label: "Gmail", host: "smtp.gmail.com", port: 587, ssl: false, note: "Use an app password, not your Google password. Turn on two-step verification first, then create one under Security > App passwords." },
  { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, ssl: false, note: "The account needs SMTP sending turned on by your Microsoft 365 admin." },
  { label: "Zoho Mail", host: "smtp.zoho.com", port: 465, ssl: true, note: "Use an app-specific password if you have two-step verification on." },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, ssl: false, note: "The username is the word apikey and the password is your SendGrid API key." },
];

export function EmailForm({ initial, source }: { initial: Initial | null; source: "store" | "server" | "none" }) {
  const [state, action, pending] = useActionState<EmailState, FormData>(saveEmailSettingsAction, {});
  const formProps = useNoResetForm(action, state);
  const [testState, testAction, testing] = useActionState<EmailState>(sendTestEmailAction, {});
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(String(initial?.port ?? 587));
  const [ssl, setSsl] = useState(initial?.secure ?? false);
  const [note, setNote] = useState("");

  const status =
    source === "store" ? { tone: "bg-green-500", text: "Using the settings saved here." }
    : source === "server" ? { tone: "bg-amber-500", text: "Using the server's SMTP settings from its .env file. Save settings here to replace them." }
    : { tone: "bg-neutral-400", text: "Not set up. Order confirmations cannot be emailed yet." };

  return (
    <section className="max-w-2xl space-y-3">
      <h2 className="font-semibold">Email</h2>
      <p className="text-sm text-neutral-500">The mail server THRICE sends order confirmations through. Any provider that offers SMTP works.</p>
      <p className="flex items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${status.tone}`} />
        {status.text}
      </p>

      <form {...formProps} className="card space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Provider</span>
          <select
            className="input"
            defaultValue=""
            onChange={(e) => {
              const p = PRESETS.find((x) => x.label === e.target.value);
              if (!p) return setNote("");
              setHost(p.host);
              setPort(String(p.port));
              setSsl(p.ssl);
              setNote(p.note);
            }}
          >
            <option value="">Other (enter the details)</option>
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
          {note && <span className="mt-1 block text-xs text-amber-800">{note}</span>}
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-neutral-500">Mail server</span>
            <input name="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" className="input" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Port</span>
            <input name="port" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className="input" required />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Connection</span>
          <select name="security" value={ssl ? "ssl" : "starttls"} onChange={(e) => setSsl(e.target.value === "ssl")} className="input">
            <option value="starttls">STARTTLS (usual for port 587)</option>
            <option value="ssl">SSL/TLS (usual for port 465)</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Username (leave empty if none)</span>
            <input name="user" defaultValue={initial?.user ?? ""} autoComplete="off" className="input" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Password</span>
            <input name="password" type="password" autoComplete="new-password" placeholder={initial?.hasPassword ? "Saved. Leave empty to keep it." : ""} className="input" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Send emails from</span>
          <input name="from" defaultValue={initial?.from ?? ""} placeholder="orders@yourshop.com" className="input" required />
        </label>
        <p className="text-xs text-neutral-500">The password is stored encrypted and is never shown again. To change it, type a new one.</p>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.saved && <p className="text-sm text-green-700">Saved. Send a test email to check it.</p>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving..." : "Save email settings"}
        </button>
      </form>

      <div className="card flex flex-wrap items-center gap-3">
        <form action={testAction}>
          <button type="submit" disabled={testing || source === "none"} className="btn">
            {testing ? "Sending..." : "Send a test email to me"}
          </button>
        </form>
        {source === "store" && (
          <form action={clearEmailSettingsAction}>
            <button type="submit" className="text-sm text-red-700 underline">
              Remove these settings
            </button>
          </form>
        )}
        {testState.error && <p className="w-full text-sm text-red-600">{testState.error}</p>}
        {testState.message && <p className="w-full text-sm text-green-700">{testState.message}</p>}
      </div>
    </section>
  );
}
