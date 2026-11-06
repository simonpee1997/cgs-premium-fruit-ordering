import { NextResponse } from "next/server";
import { z } from "zod";
import { shopService, requestBucket, readShopBody } from "@/lib/shop-server";
export async function POST(request: Request) {
  try {
    const parsed = z
      .object({
        token: z.uuid(),
        reference: z.string().trim().min(3).max(150),
        proof_id: z.uuid().optional(),
        proof_token: z.uuid().optional(),
      })
      .safeParse(await readShopBody(request));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Enter a valid payment reference" },
        { status: 400 },
      );
    const db = shopService();
    const gate = await db.rpc("shop_allow_request", {
      client_bucket: requestBucket(request),
    });
    if (gate.error || !gate.data)
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    const { error } = await db.rpc("submit_online_payment", parsed.data);
    if (error)
      return NextResponse.json(
        {
          error:
            "Unable to submit this reference. The order may have expired, or a reference was already submitted. Contact the store for assistance.",
        },
        { status: 400 },
      );
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Unable to submit payment reference",
      },
      {
        status:
          e instanceof Error && e.message === "Invalid origin" ? 403 : 400,
      },
    );
  }
}
