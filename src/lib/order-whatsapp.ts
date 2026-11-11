import type { PublicOrder } from "./shop-types";
import { money } from "./money";
import { orderItemEnglishName } from "./order-item-name";
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
export function whatsappPhone(phone: string): string | null {
  if (!/^\+?[\d\s()-]+$/.test(phone.trim())) return null;
  let number = phone.replace(/\D/g, "");
  if (number.startsWith("00")) number = number.slice(2);
  else if (number.startsWith("0")) number = "60" + number.slice(1);
  return /^[1-9]\d{7,14}$/.test(number) ? number : null;
}
export function orderWhatsApp(order: PublicOrder, token: string) {
  const statuses: Record<string, string> = {
    awaiting_payment:
      "Order received; payment pending / 订单已收到，付款待核实",
    payment_submitted: "Payment pending verification / 付款待核实",
    paid: "Payment confirmed / 已确认付款",
    ready: "Ready for collection / 可取货",
    dispatched: "Dispatched / 已发货",
    completed: "Completed / 已完成",
    refunded: "Refunded / 已退款",
    cancelled: "Cancelled / 已取消",
    expired: "Expired / 已过期",
  };
  const lines = [
    "CHIPSTI ENTERPRISE",
    `Order / 订单: ${oneLine(order.order_number)}`,
    `Customer / 顾客: ${oneLine(order.customer_name)}`,
    `Status / 状态: ${statuses[order.status] ?? oneLine(order.status)}`,
    "",
    ...order.items.map((item) => {
      const english = orderItemEnglishName(item);
      const name =
        english && english !== item.name
          ? `${english} / ${item.name}`
          : item.name;
      return `${oneLine(item.sku)} · ${oneLine(name)} × ${item.quantity} · ${money(item.total_sen)}`;
    }),
    "",
    `Products / 商品小计: ${money(order.subtotal_sen)}`,
  ];
  if ((order.promotion_discount_sen ?? 0) > 0)
    lines.push(
      `Product discount / 商品折扣: −${money(order.promotion_discount_sen!)}`,
    );
  lines.push(
    `Delivery / 配送费: ${money(order.delivery_fee_sen)}`,
    `Tax / 税费: ${money(order.tax_sen)}`,
    `Total / 总额: ${money(order.total_sen)}`,
    "",
    order.fulfillment === "delivery"
      ? `Delivery address / 配送地址: ${oneLine(order.address)} · ${oneLine(order.postcode)}`
      : `Pickup / 自取: ${oneLine(order.store.pickup_address)}`,
  );
  const summary = lines.join("\n");
  const phone = whatsappPhone(order.store.contact_phone);
  // The private tracking link is shared only by the explicit store-chat action.
  // Native PDF sharing carries the summary/file, without granting live link access.
  const text =
    summary +
    `\n\nView order / 查看订单: https://chipsti.com/order/${encodeURIComponent(token)}`;
  return {
    summary,
    phone,
    url: phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : null,
  };
}
