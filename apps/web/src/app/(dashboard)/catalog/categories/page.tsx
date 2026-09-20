import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { deleteCategoryAction, updateCategoryAction } from "../actions";
import { NewCategoryForm } from "../forms";

export default async function CategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  // Customers and Catalog are for owners and admins only.
  if (membership.role === "STAFF") redirect("/");
  const canEdit = true; // staff never reach the catalog, so everyone here can edit

  const categories = await prisma.category.findMany({
    where: { storeId: membership.storeId },
    include: { _count: { select: { products: true } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Categories</h1>
      {canEdit && (
        <div className="mb-6">
          <NewCategoryForm />
        </div>
      )}
      <div className="max-w-3xl space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center gap-3 py-3">
            {canEdit ? (
              <form action={updateCategoryAction.bind(null, c.id)} className="flex flex-1 flex-wrap items-center gap-2">
                <input name="name" defaultValue={c.name} required className="input max-w-xs" />
                <input name="description" defaultValue={c.description ?? ""} placeholder="Description" className="input max-w-xs" />
                <input name="displayOrder" type="number" defaultValue={c.displayOrder} className="input w-20" title="Order" />
                <button type="submit" className="btn py-1 text-xs">
                  Save
                </button>
              </form>
            ) : (
              <span className="flex-1 font-medium">{c.name}</span>
            )}
            <span className="text-xs text-neutral-500">
              {c._count.products} product{c._count.products === 1 ? "" : "s"}
            </span>
            {canEdit && (
              <form action={deleteCategoryAction.bind(null, c.id)}>
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            )}
          </div>
        ))}
        {categories.length === 0 && <p className="text-neutral-400">No categories yet.</p>}
      </div>
    </div>
  );
}
