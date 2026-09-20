"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@thrice/db";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

export type CustomerState = { error?: string; saved?: boolean };

async function requireStore() {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership) throw new Error("NO_STORE");
  if (membership.role === "STAFF") throw new Error("FORBIDDEN");
  return { user, storeId: membership.storeId };
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200),
  email: z.union([z.literal(""), z.string().trim().email("That email address doesn't look right.")]),
  phone: z.string().trim().max(60),
  company: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
});

function parse(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    company: formData.get("company") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

const orNull = (s: string) => (s === "" ? null : s);

export async function createCustomerAction(_prev: CustomerState, formData: FormData): Promise<CustomerState> {
  const { user, storeId } = await requireStore();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;

  const customer = await prisma.customer.create({
    data: { storeId, name: d.name, email: orNull(d.email), phone: orNull(d.phone), company: orNull(d.company), notes: orNull(d.notes) },
  });
  await prisma.auditLog.create({
    data: { storeId, userId: user.id, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: customer.id },
  });
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomerAction(customerId: string, _prev: CustomerState, formData: FormData): Promise<CustomerState> {
  const { user, storeId } = await requireStore();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;

  const existing = await prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } });
  if (!existing) return { error: "Customer not found." };

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: { name: d.name, email: orNull(d.email), phone: orNull(d.phone), company: orNull(d.company), notes: orNull(d.notes) },
    });
    // Orders still in progress follow the customer's contact details, so confirmations reach the right
    // address. Finished orders keep what was on file at the time.
    await tx.orderPerson.updateMany({
      where: { customerId, order: { status: { in: ["UPCOMING", "ACTIVE"] } } },
      data: { name: d.name, email: orNull(d.email), phone: orNull(d.phone) },
    });
    await tx.auditLog.create({
      data: { storeId, userId: user.id, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: customerId },
    });
  });
  revalidatePath(`/customers/${customerId}`);
  return { saved: true };
}

export async function deleteCustomerAction(customerId: string, _prev: CustomerState): Promise<CustomerState> {
  const { user, storeId } = await requireStore();
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } });
  if (!customer) return { error: "Customer not found." };
  const orders = await prisma.orderPerson.count({ where: { customerId } });
  if (orders > 0) return { error: "This customer is on existing orders, so they can't be deleted." };

  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.auditLog.create({
    data: { storeId, userId: user.id, action: "CUSTOMER_DELETED", entityType: "Customer", entityId: customerId },
  });
  redirect("/customers");
}
