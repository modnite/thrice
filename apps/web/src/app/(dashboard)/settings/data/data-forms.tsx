"use client";

import { useActionState, useState } from "react";
import { loadDemoDataAction, type DemoState } from "./actions";

export function RestoreForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; ok?: string }>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setResult({});
    try {
      const res = await fetch("/api/backup/restore", { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setResult({ error: json.error ?? "The restore failed." });
      else {
        const counts = Object.entries(json.counts as Record<string, number>)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ");
        setResult({ ok: `Restored from "${json.from}": ${counts || "settings only"}.` });
        form.reset();
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setResult({ error: "The upload did not finish. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input type="file" name="file" accept=".gz,.json,application/gzip,application/json" required className="block w-full text-sm" />
      {result.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result.ok && <p className="text-sm text-green-700">{result.ok}</p>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Restoring... this can take a minute" : "Restore this backup"}
      </button>
    </form>
  );
}

export function LoadDemoButton() {
  const [state, action, pending] = useActionState<DemoState>(loadDemoDataAction, {});
  return (
    <form action={action} className="space-y-2">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-green-700">Sample data loaded. Have a look around Orders, Inventory and Catalog.</p>}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Loading..." : "Load sample data"}
      </button>
    </form>
  );
}
