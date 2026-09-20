"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@thrice/db";
import { hashPassword } from "@thrice/shared";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

export type TeamState = { error?: string; message?: string };

type Role = "OWNER" | "ADMIN" | "STAFF";
const ROLES: Role[] = ["OWNER", "ADMIN", "STAFF"];
const MIN_PASSWORD_LENGTH = 12;

async function requireManager() {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") throw new Error("FORBIDDEN");
  return { user, storeId: membership.storeId, role: membership.role as Role };
}

// Owners manage everyone; admins manage staff only. Nobody can hand out a role above their own.
const canManage = (actor: Role, target: Role) => actor === "OWNER" || target === "STAFF";
const canGrant = (actor: Role, role: Role) => actor === "OWNER" || role === "STAFF";

async function audit(storeId: string, userId: string, action: string, entityId: string, diff?: object) {
  await prisma.auditLog.create({ data: { storeId, userId, action, entityType: "User", entityId, diff } });
}

export async function addMemberAction(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const { user, storeId, role: actorRole } = await requireManager();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const role = ROLES.find((r) => r === formData.get("role")) ?? "STAFF";
  const password = String(formData.get("password") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!canGrant(actorRole, role)) return { error: "You can only add staff members." };

  const existing = await prisma.user.findUnique({ where: { email }, include: { memberships: { where: { storeId } } } });
  if (existing?.memberships.length) return { error: "That person already has access to this store." };

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    if (!name) return { error: "Enter their name." };
    if (password.length < MIN_PASSWORD_LENGTH) return { error: `Give them a temporary password of at least ${MIN_PASSWORD_LENGTH} characters.` };
    userId = (await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(password) } })).id;
  }

  await prisma.storeMembership.create({ data: { storeId, userId, role } });
  await audit(storeId, user.id, "MEMBER_ADDED", userId, { email, role, existingAccount: Boolean(existing) });
  revalidatePath("/settings/team");
  return {
    message: existing
      ? `${existing.name} already had an account and now has access. Their password is unchanged.`
      : `${name} was added. Share the temporary password with them and ask them to change it.`,
  };
}

async function loadTarget(storeId: string, membershipId: string) {
  return prisma.storeMembership.findFirst({ where: { id: membershipId, storeId }, include: { user: true } });
}

export async function setMemberRoleAction(membershipId: string, _prev: TeamState, formData: FormData): Promise<TeamState> {
  const { user, storeId, role: actorRole } = await requireManager();
  const role = ROLES.find((r) => r === formData.get("role"));
  const target = await loadTarget(storeId, membershipId);
  if (!role || !target) return { error: "Member not found." };
  if (!canManage(actorRole, target.role) || !canGrant(actorRole, role)) return { error: "You don't have permission to change that role." };

  if (target.role === "OWNER" && role !== "OWNER") {
    const owners = await prisma.storeMembership.count({ where: { storeId, role: "OWNER" } });
    if (owners <= 1) return { error: "A store must keep at least one owner." };
  }
  await prisma.storeMembership.update({ where: { id: membershipId }, data: { role } });
  await audit(storeId, user.id, "MEMBER_ROLE_CHANGED", target.userId, { from: target.role, to: role });
  revalidatePath("/settings/team");
  return { message: "Role updated." };
}

export async function removeMemberAction(membershipId: string, _prev: TeamState): Promise<TeamState> {
  const { user, storeId, role: actorRole } = await requireManager();
  const target = await loadTarget(storeId, membershipId);
  if (!target) return { error: "Member not found." };
  if (target.userId === user.id) return { error: "You can't remove your own access." };
  if (!canManage(actorRole, target.role)) return { error: "You don't have permission to remove them." };
  if (target.role === "OWNER") {
    const owners = await prisma.storeMembership.count({ where: { storeId, role: "OWNER" } });
    if (owners <= 1) return { error: "A store must keep at least one owner." };
  }

  await prisma.storeMembership.delete({ where: { id: membershipId } });
  // With no store left, the account is switched off and signed out everywhere.
  const remaining = await prisma.storeMembership.count({ where: { userId: target.userId } });
  if (remaining === 0) {
    await prisma.user.update({ where: { id: target.userId }, data: { isActive: false } });
    await prisma.session.deleteMany({ where: { userId: target.userId } });
  }
  await audit(storeId, user.id, "MEMBER_REMOVED", target.userId, { email: target.user.email });
  revalidatePath("/settings/team");
  return {};
}

export async function resetMemberPasswordAction(membershipId: string, _prev: TeamState, formData: FormData): Promise<TeamState> {
  const { user, storeId, role: actorRole } = await requireManager();
  const password = String(formData.get("password") ?? "");
  const target = await loadTarget(storeId, membershipId);
  if (!target) return { error: "Member not found." };
  if (target.userId === user.id) return { error: "Change your own password from Your account." };
  if (!canManage(actorRole, target.role)) return { error: "You don't have permission to reset that password." };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };

  await prisma.user.update({ where: { id: target.userId }, data: { passwordHash: await hashPassword(password) } });
  await prisma.session.deleteMany({ where: { userId: target.userId } });
  await audit(storeId, user.id, "MEMBER_PASSWORD_RESET", target.userId);
  revalidatePath("/settings/team");
  return { message: "Password reset. They have been signed out." };
}
