import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const seed = readFileSync("supabase/migrations/001_core.sql", "utf8");
const products = [
  ...seed.matchAll(/\('((?:LF-|LB-|L-|LCP-)[^']+)','([^']+)',(\d+),(\d+)\)/g),
].map((m, i) => ({
  id: `40000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  sku: m[1],
  name: m[2],
  price_sen: Number(m[4]),
  category: "Snacks",
  available: 5,
  image_url: null,
  description: null,
  english_name: null,
}));
const store = {
  name: "CHIPSTI ENTERPRISE",
  ssm: "202603232290 (RA0139100-V)",
  enabled: true,
  allow_pickup: true,
  allow_delivery: true,
  allow_cash_pickup: true,
  pickup_address: "Test collection address, Kuala Lumpur",
  contact_phone: "0100000000",
  delivery_fee_sen: 500,
  delivery_note: "Test delivery to configured postcode areas",
  delivery_postcode_prefixes: ["50"],
  bank_transfer_available: true,
  duitnow_available: false,
  bank_name: "Test Bank",
  bank_account_name: "Test Store",
  bank_account_number: "TEST-ONLY-ACCOUNT",
  duitnow_qr_url: "",
  tax_bps: 600,
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/shop", (route) =>
    route.fulfill({ json: { store, products } }),
  );
  await page.goto("/");
});
test("public collection is responsive, searches Chinese SKUs and links staff to /admin", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "The collection", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".shop-product")).toHaveCount(11);
  await expect(
    page.getByRole("link", { name: "Staff sign in" }),
  ).toHaveAttribute("href", "/admin");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/shop-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Search collection").fill("原味");
  await expect(page.locator(".shop-product")).toHaveCount(1);
  await expect(page.locator(".shop-product")).toContainText("LF-02");
});
test("customer can request delivery, see exact fees and submit a manual payment reference", async ({
  page,
}) => {
  const token = "60000000-0000-0000-0000-000000000001";
  let submitted: Record<string, unknown> | undefined;
  let state = {
    order_number: "WEB-TEST-000001",
    status: "awaiting_payment",
    fulfillment: "delivery",
    created_at: "2026-11-05T01:00:00Z",
    expires_at: "2026-11-06T01:00:00Z",
    customer_name: "Test customer",
    address: "Test delivery address in Kuala Lumpur",
    postcode: "50000",
    subtotal_sen: 1800,
    delivery_fee_sen: 500,
    tax_sen: 138,
    total_sen: 2438,
    payment_method: "bank",
    payment_reference: null as string | null,
    receipt_number: null,
    cashier_name: null,
    confirmed_at: null,
    cancellation_reason: null,
    refunded_sen: 0,
    items: [
      {
        sku: "LF-02",
        name: "原味黄金呀菇",
        quantity: 1,
        unit_price_sen: 1800,
        total_sen: 1800,
      },
    ],
    store,
  };
  await page.route("**/api/shop/order", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { token, order_number: state.order_number } });
  });
  await page.route("**/api/shop/status?*", (route) =>
    route.fulfill({ json: state }),
  );
  await page.route("**/api/shop/payment", async (route) => {
    const body = route.request().postDataJSON();
    state = {
      ...state,
      status: "payment_submitted",
      payment_reference: body.reference,
    };
    await route.fulfill({ json: { ok: true } });
  });
  await page
    .getByRole("button", { name: "Add LF-02 to basket", exact: true })
    .click();
  await page.getByRole("button", { name: "Open basket, 1 items" }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByLabel("Full name").fill("Test customer");
  await page.getByLabel("Contact number").fill("0100000000");
  await page.getByLabel("Fulfillment method").selectOption("delivery");
  await page
    .getByLabel("Complete Malaysian delivery address")
    .fill(state.address);
  await page.getByLabel("Postcode", { exact: true }).fill("50000");
  await expect(page.getByLabel("Online payment method")).toHaveValue("bank");
  await expect(page.locator(".shop-grand-total")).toContainText("24.38");
  await page
    .getByRole("checkbox", { name: /I agree to the order total/ })
    .check();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/order/${token}`));
  await expect(
    page.getByRole("heading", { name: "Order received", exact: true }),
  ).toBeVisible();
  expect(submitted?.expected_total_sen).toBe(2438);
  expect(submitted?.fulfillment).toBe("delivery");
  expect(submitted).not.toHaveProperty("unit_price_sen");
  await expect(
    page.getByText("Order summary · not a payment receipt"),
  ).toBeVisible();
  await expect(page.getByText("Test Bank", { exact: true })).toBeVisible();
  await page
    .getByLabel("Bank or DuitNow transaction reference")
    .fill("TEST-REF-123");
  await page.getByRole("button", { name: "I have made payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment reference received" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/order-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("closed shop and sold-out products cannot enter a checkout cart", async ({
  page,
}) => {
  await page.route("**/api/shop", (route) =>
    route.fulfill({
      json: {
        store: { ...store, enabled: false },
        products: products.map((p) => ({ ...p, available: 0 })),
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Browse our collection. Online ordering is opening soon."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add LF-02 to basket" }),
  ).toBeDisabled();
});
test("public financial mutations reject foreign origins", async ({
  request,
}) => {
  for (const path of ["/api/shop/order", "/api/shop/payment"]) {
    const response = await request.post(path, {
      headers: { origin: "https://attacker.invalid" },
      data: {},
    });
    expect(response.status()).toBe(403);
  }
});
