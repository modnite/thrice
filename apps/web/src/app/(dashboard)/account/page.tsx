import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);

  return (
    <div className="p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Your account</h1>
      <div className="card mb-6 max-w-xl space-y-1 text-sm">
        <p className="text-lg font-medium">{user.name}</p>
        <p className="text-neutral-600">{user.email}</p>
        {membership && (
          <p className="text-neutral-500">
            {membership.role.charAt(0) + membership.role.slice(1).toLowerCase()} at {membership.storeName}
          </p>
        )}
      </div>
      <PasswordForm />
    </div>
  );
}
