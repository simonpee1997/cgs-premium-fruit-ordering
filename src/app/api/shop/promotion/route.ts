import { NextResponse } from "next/server";
import { shopService, readShopBody, requestBucket } from "@/lib/shop-server";
import { publicPromotionQuoteSchema } from "@/lib/promotion-validation";
// Phase 1's single read-only code engine. Customer checkout UI/writes remain
// unchanged until the separately approved Phase 2 integration.
export async function POST(request: Request) {
  try {
    const parsed = publicPromotionQuoteSchema.safeParse(
      await readShopBody(request),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Enter one valid promo code and basket" },
        { status: 400 },
      );
    const db = shopService();
    const gate = await db.rpc("shop_allow_request", {
      client_bucket: requestBucket(request, "promotion-quote"),
    });
    if (gate.error || !gate.data)
      return NextResponse.json(
        { error: "Too many promotion checks. Please try again later." },
        { status: 429 },
      );
    const { data, error } = await db.rpc("shop_promotion_quote", {
      promo_code: parsed.data.code,
      items: parsed.data.items,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            /Promotion is |Minimum product|No eligible|Invalid promo|Duplicate|quantity|amount/i.test(
              error.message,
            )
              ? error.message
              : "This promo code cannot be applied to this basket",
        },
        { status: 400 },
      );
    return NextResponse.json(
      {
        code: data.code,
        name: data.name,
        discount_type: data.discount_type,
        percent_bps: data.percent_bps,
        discount_sen: data.discount_sen,
        product_subtotal_sen: data.product_subtotal_sen,
        subtotal_after_discount_sen: data.subtotal_after_discount_sen,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const origin = e instanceof Error && e.message === "Invalid origin";
    return NextResponse.json(
      { error: origin ? "Invalid origin" : "Unable to check promo code" },
      { status: origin ? 403 : 400 },
    );
  }
}
