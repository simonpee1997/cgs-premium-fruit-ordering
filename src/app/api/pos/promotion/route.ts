import { NextResponse } from "next/server";
import { database } from "@/lib/supabase";
import { readShopBody } from "@/lib/shop-server";
import { publicPromotionQuoteSchema } from "@/lib/promotion-validation";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const parsed = publicPromotionQuoteSchema.safeParse(
      await readShopBody(request),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Enter one valid code and basket" },
        { status: 400, headers },
      );
    const db = await database();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401, headers },
      );
    const { data, error } = await db.rpc("pos_promotion_quote", {
      payload: parsed.data,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            /Promotion is |Minimum product|No eligible|Invalid promo|Duplicate|quantity|amount/i.test(
              error.message,
            )
              ? error.message
              : "This code cannot be applied to this basket",
        },
        { status: 400, headers },
      );
    return NextResponse.json(data, { headers });
  } catch (e) {
    const origin = e instanceof Error && e.message === "Invalid origin";
    return NextResponse.json(
      { error: "Unable to check promo code" },
      { status: origin ? 403 : 400, headers },
    );
  }
}
