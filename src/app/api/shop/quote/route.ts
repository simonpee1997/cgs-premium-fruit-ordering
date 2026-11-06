import { NextResponse } from "next/server";
import { onlineQuoteSchema } from "@/lib/shop-validation";
import { shopService, readShopBody, requestBucket } from "@/lib/shop-server";
export async function POST(request: Request) {
  try {
    const parsed = onlineQuoteSchema.safeParse(await readShopBody(request));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Check cart quantities and delivery address" },
        { status: 400 },
      );
    const db = shopService();
    const gate = await db.rpc("shop_allow_request", {
      client_bucket: requestBucket(request, "quote"),
    });
    if (gate.error || !gate.data)
      return NextResponse.json(
        { error: "Too many quote requests. Please wait and retry." },
        { status: 429 },
      );
    const { data, error } = await db.rpc("quote_online_order", {
      payload: parsed.data,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            /Promotion|promo|Minimum|eligible|stack|stock|fulfillment|postcode|address|amount|quantity|Duplicate/i.test(
              error.message,
            )
              ? error.message
              : "Unable to check prices. Refresh your basket.",
        },
        { status: 400 },
      );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const origin = e instanceof Error && e.message === "Invalid origin";
    return NextResponse.json(
      { error: origin ? "Invalid origin" : "Unable to check order prices" },
      { status: origin ? 403 : 400 },
    );
  }
}
