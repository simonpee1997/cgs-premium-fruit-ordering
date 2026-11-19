import { z } from "zod";
const id = z.uuid(),
  sen = z.number().int().min(0).max(100000000),
  ids = z.array(id).max(100);
export const promotionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9_-]{2,31}$/,
    "Use 3–32 letters, numbers, hyphens or underscores",
  );
export const offerSchema = z
  .object({
    id: id.optional(),
    expected_version: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(150),
    code: promotionCodeSchema,
    discount_type: z.enum(["percent", "fixed"]),
    percent_bps: z.number().int().min(0).max(10000),
    fixed_discount_sen: sen,
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    minimum_spend_sen: sen,
    discount_cap_sen: sen
      .refine((n) => n > 0, "Cap must be greater than zero")
      .nullable(),
    max_redemptions: z.number().int().min(1).max(1000000000).nullable(),
    eligible_product_ids: ids,
    eligible_category_ids: ids,
    excluded_product_ids: ids,
    excluded_category_ids: ids,
    allow_manual_stacking: z.boolean(),
    publish: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Date(v.ends_at) <= new Date(v.starts_at))
      ctx.addIssue({
        code: "custom",
        message: "Expiry must be after the start time",
      });
    if (
      v.discount_type === "percent"
        ? v.percent_bps < 1
        : v.fixed_discount_sen < 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Discount must be greater than zero",
      });
    if (v.id && !v.expected_version)
      ctx.addIssue({
        code: "custom",
        message: "Refresh the offer before editing",
      });
    for (const list of [
      v.eligible_product_ids,
      v.eligible_category_ids,
      v.excluded_product_ids,
      v.excluded_category_ids,
    ])
      if (new Set(list).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate eligibility selections",
        });
  });
export const promotionItemsSchema = z
  .array(
    z
      .object({ product_id: id, quantity: z.number().int().min(1).max(100) })
      .strict(),
  )
  .min(1)
  .max(50);
export const promotionAdminSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("save"), offer: offerSchema }).strict(),
  z
    .object({
      operation: z.enum([
        "publish",
        "pause",
        "resume",
        "end",
        "duplicate",
        "delete_draft",
      ]),
      id,
      expected_version: z.number().int().min(1),
    })
    .strict(),
  z.object({ operation: z.literal("generate") }).strict(),
  z
    .object({
      operation: z.literal("simulate"),
      code: promotionCodeSchema,
      items: promotionItemsSchema,
      at: z.iso.datetime({ offset: true }).optional(),
      preview_draft: z.boolean().default(true),
      manual_discount_sen: sen.default(0),
    })
    .strict(),
]);
export const publicPromotionQuoteSchema = z
  .object({ code: promotionCodeSchema, items: promotionItemsSchema })
  .strict();
