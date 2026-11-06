"use client";
import { useRef, useState } from "react";
import { validateProofFile, type UploadedProof } from "@/lib/payment-proof";
export default function PaymentProofUpload({
  totalSen,
  onUploaded,
  disabled = false,
}: {
  totalSen: number;
  onUploaded: (proof: UploadedProof | null) => void;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uploaded, setUploaded] = useState(false);
  const key = useRef("");
  async function upload(selected: File) {
    setBusy(true);
    setError("");
    setUploaded(false);
    onUploaded(null);
    try {
      validateProofFile(selected);
      const bytes = await selected.arrayBuffer();
      validateProofFile(selected, new Uint8Array(bytes));
      const sha = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      key.current ||= crypto.randomUUID();
      const prepared = await fetch("/api/shop/proof/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key.current,
          filename: selected.name,
          mime_type: validateProofFile(selected),
          byte_size: selected.size,
          sha256: sha,
          total_sen: totalSen,
        }),
      });
      const stage = await prepared.json();
      if (!prepared.ok) throw new Error(stage.error);
      if (!stage.ready) {
        const uploadUrl = new URL(stage.upload_url);
        if (
          uploadUrl.protocol !== "https:" ||
          !uploadUrl.pathname.startsWith(
            "/storage/v1/object/upload/sign/payment-proofs/",
          )
        )
          throw new Error("Invalid private upload destination");
        const result = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": validateProofFile(selected),
            "x-upsert": "false",
            "cache-control": "max-age=0",
          },
          body: bytes,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        // On retry an already-existing object is independently checked below.
        if (!result.ok && result.status !== 409)
          throw new Error("Receipt upload failed. Please retry.");
      }
      const completed = await fetch("/api/shop/proof/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stage.id, token: stage.token }),
      });
      const proof = await completed.json();
      if (!completed.ok) throw new Error(proof.error);
      onUploaded(proof);
      setUploaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload receipt");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="payment-proof-upload">
      <label>
        Upload Payment Proof / 上传付款凭证
        <input
          type="file"
          required
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          disabled={disabled || busy}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            setFile(selected ?? null);
            key.current = "";
            onUploaded(null);
            setUploaded(false);
            setError("");
            if (selected) void upload(selected);
          }}
        />
      </label>
      <p>
        JPG, JPEG, PNG or PDF · up to 5 MB. Receipts are private and viewable
        only by authorized staff.
      </p>
      {busy && <p role="status">Uploading and checking your receipt…</p>}
      {uploaded && (
        <p role="status">
          Receipt uploaded. Payment is still pending verification.
        </p>
      )}
      {error && (
        <>
          <p className="shop-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="shop-secondary"
            disabled={!file || disabled || busy}
            onClick={() => file && void upload(file)}
          >
            Retry receipt upload
          </button>
        </>
      )}
    </div>
  );
}
