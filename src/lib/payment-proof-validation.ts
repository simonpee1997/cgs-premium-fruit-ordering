import { z } from "zod";
import { MAX_PROOF_BYTES } from "./payment-proof";
export const prepareProofSchema = z
  .object({
    key: z.uuid(),
    filename: z.string().min(1).max(150),
    mime_type: z.enum(["image/jpeg", "image/png", "application/pdf"]),
    byte_size: z.number().int().min(1).max(MAX_PROOF_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    total_sen: z.number().int().min(1).max(100000000),
  })
  .strict();
export const completeProofSchema = z
  .object({ id: z.uuid(), token: z.uuid() })
  .strict();
