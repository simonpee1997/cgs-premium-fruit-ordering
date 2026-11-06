import type { DeliveryArea } from "./shop-types";

export const FREE_DELIVERY_THRESHOLD_SEN = 30_000;

// This estimate is repeated authoritatively in PostgreSQL at order placement.
// Discounts here are product discounts only; shipping/tax never qualify.
export function deliveryQuote({
  fulfillment,
  postcode,
  address,
  subtotal_sen,
  discount_sen = 0,
  default_fee_sen,
  areas = [],
  postcode_prefixes = [],
}: {
  fulfillment: "pickup" | "delivery";
  postcode: string;
  address: string;
  subtotal_sen: number;
  discount_sen?: number;
  default_fee_sen: number;
  areas?: DeliveryArea[];
  postcode_prefixes?: string[];
}) {
  if (
    !Number.isSafeInteger(subtotal_sen) ||
    subtotal_sen < 0 ||
    !Number.isSafeInteger(discount_sen) ||
    discount_sen < 0 ||
    discount_sen > subtotal_sen
  )
    throw new Error("Invalid product subtotal or discount");
  const netSubtotal = subtotal_sen - discount_sen;
  const code = postcode.trim();
  const confirmed = /^\d{5}$/.test(code) && address.trim().length >= 10;
  const deliverable =
    /^\d{5}$/.test(code) &&
    (!postcode_prefixes.length ||
      postcode_prefixes.some((prefix) => code.startsWith(prefix)));
  const area = areas.find((area) => area.postcodes.includes(code));
  const eligible =
    confirmed && deliverable && Boolean(area?.free_delivery_eligible);
  const standard =
    fulfillment === "pickup" ? 0 : (area?.standard_fee_sen ?? default_fee_sen);
  const free =
    fulfillment === "delivery" &&
    eligible &&
    netSubtotal >= FREE_DELIVERY_THRESHOLD_SEN;
  return {
    area,
    confirmed,
    deliverable,
    eligible,
    free,
    net_subtotal_sen: netSubtotal,
    remaining_sen: Math.max(0, FREE_DELIVERY_THRESHOLD_SEN - netSubtotal),
    standard_fee_sen: standard,
    delivery_discount_sen: free ? standard : 0,
    fee_sen: free ? 0 : standard,
  };
}
