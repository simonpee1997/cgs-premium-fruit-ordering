import { NextResponse } from "next/server";
import { onlineOrderSchema } from "@/lib/shop-validation";
import { shopService, requestBucket, readShopBody } from "@/lib/shop-server";
export async function POST(request: Request) {
  try {
    const parsed = onlineOrderSchema.safeParse(await readShopBody(request));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    const db = shopService(),
      bucket = requestBucket(request);
    const gate = await db.rpc("shop_allow_request", { client_bucket: bucket });
    if (gate.error)
      throw new Error(
        "Ordering is temporarily unavailable. Please contact the store.",
      );
    if (!gate.data)
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    const { data, error } = await db.rpc("place_online_order", {
      payload: parsed.data,
      client_bucket: bucket,
    });
    if (error) {
      const safe =
        /stock|unavailable|not configured|postcode|different order|amount|quantity|Duplicate|Too many|Prices|Refresh/i.test(
          error.message,
        )
          ? error.message
          : "Unable to place this order. Please refresh and try again.";
      return NextResponse.json({ error: safe }, { status: 400 });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to place order";
    return NextResponse.json(
      { error: message },
      { status: message === "Invalid origin" ? 403 : 503 },
    );
  }
}
