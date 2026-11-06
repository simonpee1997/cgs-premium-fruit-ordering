import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/supabase";
import { shopService } from "@/lib/shop-server";
import { PROOF_BUCKET } from "@/lib/payment-proof";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
  try {
    const id = z
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("order_id"));
    if (!id.success)
      return NextResponse.json(
        { error: "Invalid order" },
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
    // The staff-session RPC checks active owner/manager status AND order branch.
    const { data: proof, error } = await db.rpc("staff_payment_proof", {
      order_id: id.data,
    });
    if (error)
      return NextResponse.json(
        { error: "Payment proof access denied" },
        { status: 403, headers },
      );
    if (!proof)
      return NextResponse.json(
        { error: "No payment proof is available" },
        { status: 404, headers },
      );
    const file = await shopService()
      .storage.from(PROOF_BUCKET)
      .download(proof.path);
    if (file.error || !file.data)
      return NextResponse.json(
        { error: "Unable to download payment proof" },
        { status: 503, headers },
      );
    const extension =
      proof.mime_type === "application/pdf"
        ? "pdf"
        : proof.mime_type === "image/png"
          ? "png"
          : "jpg";
    // Always attachment: customer PDFs/filenames never become executable site HTML.
    return new Response(file.data.stream(), {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="payment-proof-${proof.id}.${extension}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to access payment proof" },
      { status: 503, headers },
    );
  }
}
