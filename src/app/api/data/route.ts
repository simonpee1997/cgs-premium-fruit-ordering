import { loadData } from "@/lib/data";
import { NextResponse } from "next/server";
export async function GET() {
  try {
    const data = await loadData();
    return NextResponse.json(data, {
      status: data ? 200 : 401,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load" },
      { status: 400 },
    );
  }
}
