import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-6">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Not found</h1>
        <p className="mb-6 text-sm text-neutral-600">
          That page or record doesn&apos;t exist, or it belongs to a different store.
        </p>
        <Link href="/" className="btn-primary">
          Go to Home
        </Link>
      </div>
    </div>
  );
}
