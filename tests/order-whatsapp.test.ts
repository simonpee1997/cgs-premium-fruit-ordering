import { describe, it, expect } from "vitest";
import { whatsappPhone, orderWhatsApp } from "../src/lib/order-whatsapp";
import type { PublicOrder } from "../src/lib/shop-types";
const order: PublicOrder = {
  order_number: "WEB-TEST-123",
  status: "payment_submitted",
  fulfillment: "delivery",
  created_at: "2026-11-11T01:00:00Z",
  expires_at: "2026-11-12T01:00:00Z",
  customer_name: "Test customer",
  address: "Test Kuching address",
  postcode: "93000",
  subtotal_sen: 30000,
  delivery_fee_sen: 0,
  tax_sen: 0,
  total_sen: 30000,
  payment_method: "bank",
  payment_reference: "TEST",
  receipt_number: null,
  cashier_name: null,
  confirmed_at: null,
  cancellation_reason: null,
  refunded_sen: 0,
  items: [
    {
      sku: "L-121",
      name: "墨西哥风味巧克力蛋饼",
      quantity: 2,
      unit_price_sen: 15000,
      total_sen: 30000,
    },
  ],
  store: {
    pickup_address: "Test pickup",
    contact_phone: "014-737 1434",
    delivery_note: "",
    bank_name: "Maybank",
    bank_account_name: "CHIPSTI ENTERPRISE",
    bank_account_number: "512222906185",
    duitnow_qr_url: "/branding/chipsti-duitnow.original.jpeg",
  },
};
describe("saved order WhatsApp sharing", () => {
  it("normalizes saved Malaysian and international recipient numbers", () => {
    expect(whatsappPhone("014-737 1434")).toBe("60147371434");
    expect(whatsappPhone("+60 14 737 1434")).toBe("60147371434");
    expect(whatsappPhone("0060147371434")).toBe("60147371434");
    expect(whatsappPhone("https://evil.example")).toBeNull();
    expect(whatsappPhone("")).toBeNull();
    expect(whatsappPhone("123")).toBeNull();
  });
  it("uses the saved merchant contact and actual order totals and pending state", () => {
    const result = orderWhatsApp(order, "private-order-token");
    const url = new URL(result.url!);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/60147371434");
    const text = url.searchParams.get("text")!;
    expect(text).toContain("WEB-TEST-123");
    expect(text).toContain(
      "Mexico Chocolate Cream Kapet / 墨西哥风味巧克力蛋饼 × 2",
    );
    expect(text).toContain("300.00");
    expect(text).toContain("93000");
    expect(text).toContain("Payment pending verification");
    expect(text).not.toContain("Payment confirmed");
    expect(text).toContain("https://chipsti.com/order/private-order-token");
    expect(result.summary).not.toContain("private-order-token");
    expect(result.summary).not.toContain("https://chipsti.com/order/");
  });
  it("does not invent a recipient when the saved contact is missing", () => {
    expect(
      orderWhatsApp(
        { ...order, store: { ...order.store, contact_phone: "" } },
        "token",
      ).url,
    ).toBeNull();
  });
});
