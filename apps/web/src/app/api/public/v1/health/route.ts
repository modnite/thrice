import { authenticate, isResponse, json } from "@/lib/public-api";

// Confirms the key, the store and the service user are all configured. Used by the website's "system" page.
export async function GET(req: Request) {
  const ctx = await authenticate(req);
  if (isResponse(ctx)) return ctx;
  return json({ status: "ok", api: "public/v1" });
}
