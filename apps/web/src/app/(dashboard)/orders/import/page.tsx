import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { OrdersImportForm } from "./import-form";

export default async function ImportOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  if (membership.role === "STAFF") redirect("/orders");

  return (
    <div className="p-4 md:p-8">
      <Link href="/orders" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Orders
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">Import orders</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-600">
        Bring existing orders in from a spreadsheet, keeping their order numbers, dates, serial numbers and payment status. One row
        per item. Rows with the same order number form one order. Orders that already exist are skipped, so it is safe to run again.
      </p>

      <div className="mb-6 max-w-2xl rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <a href="/orders/import/template" className="btn mb-3 inline-block" download>
          Download the template
        </a>
        <ul className="list-disc space-y-1 pl-5 text-neutral-600">
          <li>
            <strong>Required:</strong> order number, customer, start, end, product. Import products and stock first (Inventory &gt; Import CSV) so the
            names and serial numbers can be found.
          </li>
          <li>
            <strong>Optional:</strong> status (upcoming, active, completed, cancelled), email, phone, variant, quantity, serial (several serials
            separated by <code>/</code>), price each, payment (paid or unpaid), payment method, prepared, returned (actual return time), created, discount %, notes.
          </li>
          <li>Times are in your store&apos;s timezone, for example <code>19.09.2026 12:00</code> or <code>2026-09-19 12:00</code>.</li>
          <li>
            Leave <em>price each</em> empty to price the item from your rates. Fill it in to keep the price the customer was actually charged.
          </li>
          <li>Active and upcoming orders hold their stock straight away, so they will show as unavailable to new bookings.</li>
        </ul>
      </div>

      <OrdersImportForm />
    </div>
  );
}
