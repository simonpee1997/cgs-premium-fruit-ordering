import { z } from "zod";
const id = z.string().uuid(),
  sen = z.number().int().min(0).max(100_000_000),
  text = z.string().trim().min(1).max(500),
  optional = z.string().max(2000).optional();
export const checkoutSchema = z.object({
  key: id,
  customer_id: id.optional(),
  items: z
    .array(
      z.object({
        product_id: id,
        quantity: z.number().int().min(1).max(10000),
        discount_sen: sen.default(0),
      }),
    )
    .min(1)
    .max(200),
  discount_kind: z.enum(["fixed", "percent"]),
  discount_value: sen,
  promotion_id: id.optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "duitnow", "bank", "debit", "credit"]),
        amount_sen: sen.positive(),
        tendered_sen: sen,
        reference: optional,
      }),
    )
    .min(0)
    .max(10),
});
export const actions = {
  void_sale: z.object({
    sale_id: id,
    reason: text.min(3),
    method: z.enum(["cash", "duitnow", "bank", "debit", "credit"]),
    restock: z.boolean(),
  }),
  hold: z.object({
    label: text,
    cart: z
      .array(
        z.object({
          product_id: id,
          quantity: z.number().int().min(1).max(10000),
          discount_sen: sen,
        }),
      )
      .max(200),
  }),
  delete_hold: z.object({ id }),
  customer: z.object({
    id: id.optional(),
    membership_tier: optional,
    loyalty_points: z.number().int().min(0).max(100000000).optional(),
    name: text,
    phone: optional,
    email: z.union([z.email(), z.literal("")]).optional(),
    notes: optional,
    marketing_consent: z.boolean().default(false),
  }),
  open_session: z.object({ opening_sen: sen }),
  close_session: z.object({ id, actual_sen: sen }),
  approve_session: z.object({ id }),
  cash_movement: z.object({
    session_id: id,
    amount_sen: z
      .number()
      .int()
      .min(-100000000)
      .max(100000000)
      .refine((v) => v !== 0),
    reason: text,
  }),
  adjust_stock: z.object({
    product_id: id,
    quantity: z
      .number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((v) => v !== 0),
    reason: text.min(3),
    type: z.enum(["stock-in", "stock-out", "damaged", "expired", "adjustment"]),
    batch: optional,
    expires_on: z.iso.date().optional(),
  }),
  supplier: z.object({
    id: id.optional(),
    name: text,
    phone: optional,
    email: optional,
    notes: optional,
  }),
  purchase_order: z.object({
    supplier_id: id,
    product_id: id,
    quantity: z.number().int().min(1).max(1000000),
    cost_sen: sen,
  }),
  receive_order: z.object({ id }),
  refund: z.object({
    key: id,
    sale_id: id,
    sale_item_id: id,
    quantity: z.number().int().positive().max(10000),
    reason: text.min(3),
    method: z.enum(["cash", "duitnow", "bank", "debit", "credit"]),
    restock: z.boolean(),
  }),
  product: z.object({
    id: id.optional(),
    sku: text.max(80),
    name: text,
    english_name: optional,
    description: optional,
    barcode: optional,
    category_id: id.optional(),
    price_sen: sen,
    cost_sen: sen,
    image_url: z
      .union([z.url().refine((v) => v.startsWith("https://")), z.literal("")])
      .optional(),
    archived: z.boolean(),
    low_stock: z.number().int().min(0).max(100000),
  }),
  staff: z.object({
    id,
    display_name: text,
    role: z.enum(["owner", "manager", "cashier"]),
    active: z.boolean(),
  }),
  settings: z.object({
    tax_bps: z.number().int().min(0).max(10000),
    cashier_discount_bps: z.number().int().min(0).max(10000),
  }),
  category: z.object({ name: text }),
  promotion_toggle: z.object({ id, active: z.boolean() }),
  promotion: z.object({
    name: text,
    percent_bps: z.number().int().min(0).max(10000),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
  }),
} as const;
