export type PromotionStatus =
  | "Draft"
  | "Scheduled"
  | "Active"
  | "Paused"
  | "Expired"
  | "Redemption Limit Reached";
export type Offer = {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  discount_type: "percent" | "fixed";
  percent_bps: number;
  fixed_discount_sen: number;
  starts_at: string;
  ends_at: string;
  publication_status: "draft" | "published" | "paused" | "ended";
  version: number;
  minimum_spend_sen: number;
  discount_cap_sen: number | null;
  max_redemptions: number | null;
  eligible_product_ids: string[];
  eligible_category_ids: string[];
  excluded_product_ids: string[];
  excluded_category_ids: string[];
  allow_manual_stacking: boolean;
  status: PromotionStatus;
  redemptions: number;
  reserved: number;
  total_discount_sen: number;
  associated_sales_sen: number;
  net_sales_sen: number;
};
export type PromotionRedemption = {
  id: string;
  promotion_id: string;
  code: string;
  promotion_name: string;
  promotion_version: number;
  order_id: string | null;
  order_number: string | null;
  sale_id: string | null;
  state: string;
  discount_sen: number;
  product_subtotal_sen: number;
  created_at: string;
  expires_at: string;
  sale_total_sen: number;
  refund_sen: number;
};
export type PromotionDashboard = {
  server_time: string;
  offers: Offer[];
  redemptions: PromotionRedemption[];
};
export function malaysiaDateTimeInput(iso: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}
export function malaysiaInputToUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error("Enter a valid Malaysia date and time");
  const date = new Date(value + "+08:00");
  if (
    !Number.isFinite(date.getTime()) ||
    malaysiaDateTimeInput(date.toISOString()) !==
      (value.length === 16 ? value + ":00" : value)
  )
    throw new Error("Enter a valid Malaysia date and time");
  return date.toISOString();
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[\s]*[=+\-@]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
