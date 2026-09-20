import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { holidaysSchema, openingHoursSchema, resolvePaymentMethods } from "@thrice/shared";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");

  const store = await prisma.store.findUniqueOrThrow({ where: { id: membership.storeId } });
  const parsed = openingHoursSchema.safeParse(store.openingHours);
  const holidaysParsed = holidaysSchema.safeParse(store.holidays);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {membership.role !== "STAFF" && (
          <div className="flex gap-2">
            <Link href="/settings/data" className="btn">
              Data and backup
            </Link>
            <Link href="/settings/integrations" className="btn">
              Integrations
            </Link>
            <Link href="/settings/team" className="btn">
              Manage team
            </Link>
          </div>
        )}
      </div>
      <SettingsForm
        store={{
          name: store.name,
          tagline: store.tagline,
          address: store.address,
          phone: store.phone,
          email: store.email,
          emailSubject: store.emailSubject,
          emailIntro: store.emailIntro,
          emailFooter: store.emailFooter,
          sendConfirmationOnCreate: store.sendConfirmationOnCreate,
        }}
        openingHours={parsed.success ? parsed.data : null}
        holidays={holidaysParsed.success ? holidaysParsed.data : null}
        paymentMethods={resolvePaymentMethods(store.paymentMethodConfig)}
        currency={store.currency}
      />
    </div>
  );
}
