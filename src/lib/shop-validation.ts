import { z } from "zod";
const text = z.string().trim().min(1).max(150),
  id = z.uuid();
export const deliveryAreasSchema = z
  .array(
    z.object({
      id,
      name: z.string().trim().min(1).max(100),
      postcodes: z
        .array(
          z
            .string()
            .regex(/^\d{5}$/, "Each area needs exact five-digit postcodes"),
        )
        .min(1)
        .max(100),
      standard_fee_sen: z.number().int().min(0).max(10000000),
      free_delivery_eligible: z.boolean(),
    }),
  )
  .max(20)
  .superRefine((areas, ctx) => {
    const ids = areas.map((a) => a.id);
    const codes = areas.flatMap((a) => a.postcodes);
    if (
      new Set(ids).size !== ids.length ||
      new Set(codes).size !== codes.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Each delivery area and postcode must be unique",
      });
  });
export const onlineOrderSchema = z
  .object({
    key: id,
    expected_total_sen: z.number().int().min(1).max(100000000),
    name: text,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,30}$/, "Enter a valid contact number")
      .refine((v) => {
        const n = v.replace(/\D/g, "").length;
        return n >= 7 && n <= 15;
      }, "Enter a valid contact number"),
    email: z.union([z.email().max(254), z.literal("")]).optional(),
    fulfillment: z.enum(["pickup", "delivery"]),
    address: z.string().trim().max(1000).default(""),
    postcode: z.string().trim().max(5).default(""),
    notes: z.string().trim().max(1000).default(""),
    payment_method: z.enum(["cash", "bank", "duitnow"]),
    proof_id: id.optional(),
    proof_token: id.optional(),
    payment_reference: z.string().trim().max(150).optional(),
    website: z.string().max(0).default(""),
    items: z
      .array(
        z.object({
          product_id: id,
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.payment_method === "duitnow" && (!v.proof_id || !v.proof_token))
      ctx.addIssue({
        code: "custom",
        path: ["proof_id"],
        message: "Upload a payment proof before submitting a QR order",
      });
    if (v.fulfillment === "delivery") {
      if (v.address.length < 10)
        ctx.addIssue({
          code: "custom",
          path: ["address"],
          message: "Enter a complete delivery address",
        });
      if (!/^\d{5}$/.test(v.postcode))
        ctx.addIssue({
          code: "custom",
          path: ["postcode"],
          message: "Enter a five-digit Malaysian postcode",
        });
      if (v.payment_method === "cash")
        ctx.addIssue({
          code: "custom",
          path: ["payment_method"],
          message: "Delivery requires bank transfer or DuitNow",
        });
    }
    if (new Set(v.items.map((i) => i.product_id)).size !== v.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Duplicate products",
      });
  });
export const onlineSettingsSchema = z
  .object({
    enabled: z.boolean(),
    allow_pickup: z.boolean(),
    allow_delivery: z.boolean(),
    allow_cash_pickup: z.boolean(),
    pickup_address: z.string().max(1000),
    contact_phone: z.string().max(30),
    delivery_fee_sen: z.number().int().min(0).max(10000000),
    delivery_postcode_prefixes: z.array(z.string().regex(/^\d{1,5}$/)).max(200),
    delivery_areas: deliveryAreasSchema.optional(),
    delivery_note: z.string().max(1000),
    bank_name: z.string().max(150),
    bank_account_name: z.string().max(150),
    bank_account_number: z.string().max(100),
    duitnow_qr_url: z.union([
      z.literal(""),
      z
        .url()
        .refine((url) => url.startsWith("https://"), "Use an HTTPS image URL"),
    ]),
  })
  .superRefine((v, ctx) => {
    if (v.enabled) {
      if (!v.allow_pickup && !v.allow_delivery)
        ctx.addIssue({ code: "custom", message: "Enable pickup or delivery" });
      if (v.allow_pickup && v.pickup_address.trim().length < 5)
        ctx.addIssue({
          code: "custom",
          path: ["pickup_address"],
          message: "Enter the pickup address",
        });
      if (v.allow_delivery && !v.delivery_note.trim())
        ctx.addIssue({
          code: "custom",
          path: ["delivery_note"],
          message: "Enter delivery instructions",
        });
      const bank = Boolean(
        v.bank_name.trim() &&
        v.bank_account_name.trim() &&
        v.bank_account_number.trim(),
      );
      if (v.allow_delivery && !bank && !v.duitnow_qr_url)
        ctx.addIssue({
          code: "custom",
          message:
            "Configure bank transfer or DuitNow before enabling delivery",
        });
      if (v.allow_pickup && !v.allow_cash_pickup && !bank && !v.duitnow_qr_url)
        ctx.addIssue({
          code: "custom",
          message: "Configure a pickup payment method",
        });
    }
  });
export const onlineManagementSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("configure"),
    settings: onlineSettingsSchema,
  }),
  z.object({
    operation: z.literal("confirm_payment"),
    id,
    reference: z.string().trim().max(150).optional(),
    tendered_sen: z.number().int().min(0).max(100000000).optional(),
    verified: z.literal(true),
  }),
  z.object({ operation: z.literal("cancel"), id, reason: text.min(3) }),
  z.object({
    operation: z.literal("fulfill"),
    id,
    status: z.enum(["ready", "dispatched", "completed"]),
  }),
]);

export const onlineQuoteSchema = z
  .object({
    items: z
      .array(
        z.object({
          product_id: z.uuid(),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(50),
    fulfillment: z.enum(["pickup", "delivery"]),
    address: z.string().trim().max(1000),
    postcode: z.string().trim().max(5),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.fulfillment === "delivery" &&
      (v.address.length < 10 || !/^\d{5}$/.test(v.postcode))
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter a complete delivery address and five-digit postcode",
      });
  });
