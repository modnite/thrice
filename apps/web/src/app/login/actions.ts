"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@thrice/shared";

export type LoginState = { error?: string };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit(`login:${ip}:${parsed.data.email}`, 10, 60 * 15);
  if (!allowed) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const user = await login(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "Invalid email or password." };
  }

  redirect("/");
}
