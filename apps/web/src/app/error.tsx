"use client";

import { useEffect } from "react";

// Shown when a page throws. The real error goes to the server log; staff just get a way forward.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-6">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
        <p className="mb-6 text-sm text-neutral-600">
          The page couldn&apos;t load. Your data is safe. Try again, and if it keeps happening tell whoever runs this
          system{error.digest ? ` and quote reference ${error.digest}` : ""}.
        </p>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/" className="btn">
            Go to Home
          </a>
        </div>
      </div>
    </div>
  );
}
