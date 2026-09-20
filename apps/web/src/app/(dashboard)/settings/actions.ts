"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@thrice/db";
import { holidaysSchema, openingHoursSchema, paymentMethodsInputSchema, WEEKDAY_LABELS, type HolidaysConfig, type OpeningHours } from "@thrice/shared";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

export type SettingsState = { error?: string; saved?: boolean };

const clean = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

export async function saveStoreSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership) return { error: "No store selected." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return { error: "Only owners and admins can change store settings." };
  }

  const name = clean(formData.get("name"));
  if (!name) return { error: "Store name is required." };

  let openingHours: OpeningHours | null = null;
  if (formData.get("restrictHours") === "on") {
    const hours: Record<string, { open: string; close: string } | null> = {};
    for (let d = 0; d < 7; d++) {
      const closed = formData.get(`closed-${d}`) === "on";
      hours[String(d)] = closed
        ? null
        : { open: String(formData.get(`open-${d}`) ?? ""), close: String(formData.get(`close-${d}`) ?? "") };
    }
    const parsed = openingHoursSchema.safeParse(hours);
    if (!parsed.success) {
      const idx = Number(parsed.error.issues[0]?.path[0]);
      return { error: `${WEEKDAY_LABELS[idx] ?? "Opening hours"}: ${parsed.error.issues[0]?.message ?? "invalid"}` };
    }
    openingHours = parsed.data;
  }

  let holidays: HolidaysConfig | null = null;
  if (openingHours) {
    let rawHolidays: unknown = null;
    try {
      rawHolidays = JSON.parse(String(formData.get("holidays") ?? "null"));
    } catch {
      return { error: "Could not read the holidays." };
    }
    if (rawHolidays !== null) {
      const holidaysParsed = holidaysSchema.safeParse(rawHolidays);
      if (!holidaysParsed.success) return { error: holidaysParsed.error.issues[0]?.message ?? "Check the holidays." };
      holidays = holidaysParsed.data;
    }
  }

  let rawMethods: unknown;
  try {
    rawMethods = JSON.parse(String(formData.get("paymentMethods") ?? "[]"));
  } catch {
    return { error: "Could not read the payment options." };
  }
  const methodsParsed = paymentMethodsInputSchema.safeParse(rawMethods);
  if (!methodsParsed.success) return { error: methodsParsed.error.issues[0]?.message ?? "Check the payment options." };
  const paymentMethodConfig = methodsParsed.data;

  const data = {
    emailSubject: clean(formData.get("emailSubject")),
    emailIntro: clean(formData.get("emailIntro")),
    emailFooter: clean(formData.get("emailFooter")),
    sendConfirmationOnCreate: formData.get("sendConfirmationOnCreate") === "on",
    name,
    tagline: clean(formData.get("tagline")),
    address: clean(formData.get("address")),
    phone: clean(formData.get("phone")),
    email: clean(formData.get("email")),
  };

  await prisma.store.update({
    where: { id: membership.storeId },
    data: { ...data, openingHours: openingHours ?? Prisma.DbNull, holidays: holidays ?? Prisma.DbNull, paymentMethodConfig },
  });
  await prisma.auditLog.create({
    data: {
      storeId: membership.storeId,
      userId: user.id,
      action: "STORE_SETTINGS_UPDATED",
      entityType: "Store",
      entityId: membership.storeId,
      diff: { ...data, openingHours, holidays, paymentMethodConfig },
    },
  });

  revalidatePath("/", "layout");
  return { saved: true };
}
