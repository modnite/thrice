"use server";

import { redirect } from "next/navigation";
import { logout, requireSessionUser } from "@/lib/auth";
import { setCurrentStore } from "@/lib/current-store";

export async function switchStoreAction(formData: FormData) {
  const user = await requireSessionUser();
  const storeId = String(formData.get("storeId") ?? "");
  if (!user.memberships.some((m) => m.storeId === storeId)) {
    throw new Error("FORBIDDEN");
  }
  await setCurrentStore(storeId);
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
