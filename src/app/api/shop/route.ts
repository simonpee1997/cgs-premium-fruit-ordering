import { NextResponse } from "next/server";
import { catalogue } from "@/lib/shop-server";
export async function GET() {
  try {
    const data = await catalogue();
    // The database migration advertises support after installation.
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Shop unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
