"use server";

import { revalidatePath } from "next/cache";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { loadDemoData, storeIsEmpty } from "@/lib/demo-data";
import { logger } from "@/lib/logger";

export type DemoState = { error?: string; done?: boolean };

export async function loadDemoDataAction(): Promise<DemoState> {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") return { error: "Only owners and admins can do this." };
  if (!(await storeIsEmpty(membership.storeId))) return { error: "Sample data can only be loaded into an empty store." };
  try {
    await loadDemoData(membership.storeId, user.id);
  } catch (err) {
    logger.error({ err }, "loading sample data failed");
    return { error: "Could not load the sample data. See the server log for details." };
  }
  revalidatePath("/", "layout");
  return { done: true };
}
