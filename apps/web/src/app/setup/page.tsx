import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ensureSetupCode } from "@/lib/setup-code";
import { isSetUp } from "./actions";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetUp()) redirect("/login");
  await ensureSetupCode();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-4">
      <div className="card w-full max-w-md overflow-hidden p-0">
        <h1 className="bg-brand-bar px-6 py-5">
          <Logo className="h-7 w-auto" />
        </h1>
        <div className="p-6">
          <p className="mb-1 font-semibold">Welcome. Let&apos;s set up your rental admin.</p>
          <p className="mb-6 text-sm text-neutral-500">This takes a minute. You can change all of it later in Settings.</p>
          <SetupForm />
        </div>
      </div>
    </div>
  );
}
