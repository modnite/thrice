"use server";

import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { runFullImport, type FullImportInput } from "@thrice/importer";

async function readCsvField(formData: FormData, field: string) {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return undefined;
  const content = await file.text();
  return { fileName: file.name, content };
}

export async function importCsvAction(formData: FormData) {
  const user = await requireSessionUser();
  const store = await getCurrentStore(user);
  if (!store) throw new Error("NO_STORE");
  if (store.role === "STAFF") throw new Error("FORBIDDEN");

  const input: FullImportInput = {
    categoriesCsv: await readCsvField(formData, "categories"),
    productsCsv: await readCsvField(formData, "products"),
    skusCsv: await readCsvField(formData, "skus"),
    articlesCsv: await readCsvField(formData, "articles"),
  };

  await runFullImport(store.storeId, input);

  redirect("/inventory/import");
}
