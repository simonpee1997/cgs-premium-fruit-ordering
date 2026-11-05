import { NextResponse } from "next/server";
import { database } from "@/lib/supabase";
import { onlineManagementSchema } from "@/lib/shop-validation";
import { readShopBody } from "@/lib/shop-server";
export async function POST(request: Request) {
  try {
    const db = await database();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const parsed = onlineManagementSchema.safeParse(
      await readShopBody(request),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    const { operation, ...rest } = parsed.data;
    const payload =
      operation === "configure"
        ? (rest as { settings: unknown }).settings
        : rest;
    const { data, error } = await db.rpc("manage_online_order", {
      action: operation,
      payload,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}
