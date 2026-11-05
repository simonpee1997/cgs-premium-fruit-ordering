import { NextResponse } from "next/server";
import { z } from "zod";
import { shopService } from "@/lib/shop-server";
export async function GET(request: Request) {
  const token = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("token"));
  if (!token.success)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  try {
    const { data, error } = await shopService().rpc("online_order_status", {
      token: token.data,
    });
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Order status is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
