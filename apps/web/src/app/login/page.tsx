import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // A brand-new install has no store yet: send the first visitor to set it up.
  if ((await prisma.store.count()) === 0) redirect("/setup");
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
      <div className="card w-full max-w-sm overflow-hidden p-0">
        <h1 className="bg-brand-bar px-6 py-5">
          <Logo className="h-7 w-auto" />
        </h1>
        <div className="p-6">
          <p className="mb-6 text-sm text-neutral-500">Sign in to your rental admin</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
