import { NextResponse } from "next/server";
import { catalogue } from "@/lib/shop-server";
export async function GET() {
  try {
    const data = await catalogue();
    // Promotion migrations are deliberately not part of this compatible release.
    return NextResponse.json(
      { ...data, store: { ...data.store, promotions_available: false } },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Shop unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
