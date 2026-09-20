import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatDateTime } from "@/lib/format";
import { AddMemberForm, MemberControls } from "./team-forms";

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  if (membership.role === "STAFF") redirect("/settings");

  const [members, store] = await Promise.all([
    prisma.storeMembership.findMany({
      where: { storeId: membership.storeId },
      include: { user: { include: { sessions: { orderBy: { createdAt: "desc" }, take: 1 } } } },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.store.findUniqueOrThrow({ where: { id: membership.storeId }, select: { timezone: true } }),
  ]);
  const isOwner = membership.role === "OWNER";

  return (
    <div className="p-4 md:p-8">
      <Link href="/settings" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Settings
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">Team</h1>

      <div className="mb-8">
        <AddMemberForm canAddPrivileged={isOwner} />
      </div>

      <div className="max-w-3xl space-y-3">
        {members.map((m) => {
          const canManage = m.userId === user.id ? true : isOwner || m.role === "STAFF";
          return (
            <div key={m.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">
                  {m.user.name} {m.userId === user.id && <span className="text-xs text-neutral-400">(you)</span>}
                </p>
                <p className="text-sm text-neutral-600">{m.user.email}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {m.user.isActive ? "Active" : "Disabled"} &middot; last sign-in{" "}
                  {m.user.sessions[0] ? formatDateTime(m.user.sessions[0].createdAt, store.timezone) : "never"}
                </p>
              </div>
              <MemberControls
                membershipId={m.id}
                role={m.role}
                isSelf={m.userId === user.id}
                canManage={canManage && (m.userId === user.id ? isOwner : true)}
                canGrantPrivileged={isOwner}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
