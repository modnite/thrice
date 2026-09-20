import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatDateTime } from "@/lib/format";
import { importCsvAction } from "./actions";
import { SubmitButton } from "./submit-button";

export default async function ImportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const store = await getCurrentStore(user);
  if (!store) redirect("/login");

  const runs = await prisma.importRun.findMany({
    where: { storeId: store.storeId },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-2 text-2xl font-semibold">Import from TWICE</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Upload the CSV exports from your TWICE admin (Categories, Products, SKUs, Articles). Files are matched
        by natural keys, so re-uploading a fresh export updates existing records instead of duplicating them.
      </p>

      <form action={importCsvAction} className="card space-y-4">
        {[
          { field: "categories", label: "Categories CSV" },
          { field: "products", label: "Products CSV" },
          { field: "skus", label: "SKUs CSV" },
          { field: "articles", label: "Articles CSV" },
        ].map(({ field, label }) => (
          <div key={field}>
            <label className="mb-1 block text-sm font-medium">{label}</label>
            <input type="file" name={field} accept=".csv" className="input" />
          </div>
        ))}
        <SubmitButton />
      </form>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent import runs</h2>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Skipped</th>
              <th className="px-4 py-3">Errored</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3">{r.fileName}</td>
                <td className="px-4 py-3">{r.fileType}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      r.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">{r.rowsCreated}</td>
                <td className="px-4 py-3">{r.rowsUpdated}</td>
                <td className="px-4 py-3">{r.rowsSkipped}</td>
                <td className="px-4 py-3">{r.rowsErrored}</td>
                <td className="px-4 py-3">{formatDateTime(r.startedAt)}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-neutral-400">
                  No imports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
