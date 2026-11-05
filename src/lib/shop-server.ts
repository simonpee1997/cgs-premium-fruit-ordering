import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Catalogue } from "./shop-types";
export function shopService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error(
      "Online ordering is temporarily unavailable. Please contact the store.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function requestBucket(request: Request) {
  const salt =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!salt) throw new Error("Online ordering is not configured");
  // Vercel supplies the trusted client address; other hosts share a conservative bucket.
  const address =
    process.env.VERCEL === "1"
      ? (
          request.headers.get("x-vercel-forwarded-for") ||
          request.headers.get("x-forwarded-for") ||
          "unknown"
        )
          .split(",")[0]
          .trim()
      : "local-development";
  return createHmac("sha256", salt).update(address).digest("hex");
}
export async function catalogue(): Promise<Catalogue> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("The shop is being prepared. Please check back shortly.");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("shop_catalogue");
  if (error || !data)
    throw new Error("The shop is being prepared. Please check back shortly.");
  return data as Catalogue;
}
export async function readShopBody(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Error("Invalid origin");
  if (Number(request.headers.get("content-length") || 0) > 20000)
    throw new Error("Request too large");
  const body = await request.text();
  if (body.length > 20000) throw new Error("Request too large");
  return JSON.parse(body) as unknown;
}
