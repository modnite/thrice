import Link from "next/link";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="flex gap-6 border-b border-neutral-200 bg-white px-8 text-sm">
        <Link href="/catalog/products" className="border-b-2 border-transparent py-3 font-medium hover:border-brand">
          Products
        </Link>
        <Link href="/catalog/categories" className="border-b-2 border-transparent py-3 font-medium hover:border-brand">
          Categories
        </Link>
      </div>
      {children}
    </div>
  );
}
