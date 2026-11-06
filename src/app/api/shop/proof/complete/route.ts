import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { shopService, readShopBody, requestBucket } from "@/lib/shop-server";
import { completeProofSchema } from "@/lib/payment-proof-validation";
import {
  PROOF_BUCKET,
  MAX_PROOF_BYTES,
  validateProofFile,
} from "@/lib/payment-proof";
export async function POST(request: Request) {
  try {
    const parsed = completeProofSchema.safeParse(await readShopBody(request));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid receipt upload" },
        { status: 400 },
      );
    const { id, token } = parsed.data,
      db = shopService();
    const gate = await db.rpc("shop_allow_request", {
      client_bucket: requestBucket(request, "proof-upload"),
    });
    if (gate.error || !gate.data)
      return NextResponse.json(
        { error: "Too many upload requests. Please try again later." },
        { status: 429 },
      );
    const { data: proof, error } = await db.rpc("payment_proof_for_upload", {
      proof_id: id,
      proof_token: token,
    });
    if (error || !proof)
      return NextResponse.json(
        { error: "Receipt upload is unavailable or expired" },
        { status: 400 },
      );
    if (!proof.ready) {
      const download = await db.storage.from(PROOF_BUCKET).download(proof.path);
      if (download.error || !download.data)
        throw new Error("Receipt has not finished uploading. Please retry.");
      let failure = "";
      try {
        if (download.data.size > MAX_PROOF_BYTES)
          throw new Error("Payment proof exceeds 5 MB");
        const bytes = new Uint8Array(await download.data.arrayBuffer());
        validateProofFile(
          {
            name: proof.filename,
            type: proof.mime_type,
            size: proof.byte_size,
          },
          bytes,
        );
        if (createHash("sha256").update(bytes).digest("hex") !== proof.sha256)
          throw new Error("Receipt content changed during upload");
      } catch (e) {
        failure = e instanceof Error ? e.message : "Invalid receipt";
      }
      const result = await db.rpc("complete_payment_proof", {
        proof_id: id,
        proof_token: token,
        valid: !failure,
      });
      if (failure) {
        await db.storage.from(PROOF_BUCKET).remove([proof.path]);
        throw new Error(failure);
      }
      if (result.error)
        throw new Error("Unable to finalize receipt. Please retry.");
    }
    return NextResponse.json(
      { id, token, filename: proof.filename },
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
      { error: e instanceof Error ? e.message : "Unable to validate receipt" },
      { status: origin ? 403 : 400 },
    );
  }
}
