export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_BUCKET = "payment-proofs";
export const PROOF_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
} as const;
export type UploadedProof = { id: string; token: string; filename: string };

export function validateProofFile(
  file: { name: string; type: string; size: number },
  bytes?: Uint8Array,
) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferred =
    extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : extension === "pdf"
          ? "application/pdf"
          : "";
  const mime = file.type || inferred;
  if (!inferred || mime !== inferred || !(mime in PROOF_TYPES))
    throw new Error("Upload a JPG, JPEG, PNG or PDF receipt");
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_PROOF_BYTES
  )
    throw new Error("Payment proof must be between 1 byte and 5 MB");
  if (
    file.name.length > 150 ||
    [...file.name].some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error("Use a shorter receipt filename");
  if (bytes) {
    const prefix = [...bytes.slice(0, 8)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const pngEnd = [...bytes.slice(-8)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const valid =
      mime === "image/jpeg"
        ? prefix.startsWith("ffd8ff") &&
          bytes.at(-2) === 255 &&
          bytes.at(-1) === 217
        : mime === "image/png"
          ? prefix === "89504e470d0a1a0a" && pngEnd === "49454e44ae426082"
          : new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" &&
            new TextDecoder().decode(bytes.slice(-1024)).includes("%%EOF");
    if (bytes.byteLength !== file.size || !valid)
      throw new Error("Receipt content does not match its file type or size");
  }
  return mime as keyof typeof PROOF_TYPES;
}
