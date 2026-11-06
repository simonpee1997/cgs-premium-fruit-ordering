import { NextResponse } from "next/server";
import { shopService, readShopBody, requestBucket } from "@/lib/shop-server";
import { prepareProofSchema } from "@/lib/payment-proof-validation";
import { PROOF_BUCKET, validateProofFile } from "@/lib/payment-proof";
export async function POST(request: Request) {
  try {
    const parsed = prepareProofSchema.safeParse(await readShopBody(request));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Use a valid JPG, PNG or PDF receipt up to 5 MB" },
        { status: 400 },
      );
    const input = parsed.data;
    validateProofFile({
      name: input.filename,
      type: input.mime_type,
      size: input.byte_size,
    });
    const db = shopService(),
      bucket = requestBucket(request, "proof-upload");
    const gate = await db.rpc("shop_allow_request", { client_bucket: bucket });
    if (gate.error || !gate.data)
      return NextResponse.json(
        { error: "Too many upload requests. Please try again later." },
        { status: 429 },
      );
    const { data, error } = await db.rpc("prepare_payment_proof", {
      payload: input,
      client_bucket: bucket,
    });
    if (error || !data)
      return NextResponse.json(
        { error: "Unable to prepare this receipt. Start a new upload." },
        { status: 400 },
      );
    if (data.ready)
      return NextResponse.json(
        { ...data, filename: input.filename },
        { headers: { "Cache-Control": "no-store" } },
      );
    const signed = await db.storage
      .from(PROOF_BUCKET)
      .createSignedUploadUrl(data.path, { upsert: false });
    if (signed.error)
      throw new Error("Unable to prepare private receipt storage");
    return NextResponse.json(
      { ...data, filename: input.filename, upload_url: signed.data.signedUrl },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (e) {
    const origin = e instanceof Error && e.message === "Invalid origin";
    return NextResponse.json(
      {
        error: origin
          ? "Invalid origin"
          : e instanceof Error
            ? e.message
            : "Unable to prepare upload",
      },
      { status: origin ? 403 : 400 },
    );
  }
}
