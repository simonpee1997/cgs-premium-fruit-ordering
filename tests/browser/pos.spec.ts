import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
// UI fixtures are confined to browser interception. Database tests execute real SQL separately.
const seed = readFileSync("supabase/migrations/001_core.sql", "utf8");
const products = [
  ...seed.matchAll(/\('((?:LF-|LB-|L-|LCP-)[^']+)','([^']+)',(\d+),(\d+)\)/g),
].map((m, i) => ({
  id: `40000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  sku: m[1],
  name: m[2],
  price_sen: Number(m[4]),
  low_stock: 5,
  category_id: "snacks",
  archived: false,
}));
const staffId = "30000000-0000-0000-0000-000000000001";
const tables = {
  products,
  product_categories: [{ id: "snacks", name: "Snacks" }],
  inventory: products.map((p) => ({ product_id: p.id, quantity: 10 })),
  customers: [],
  sales: [],
  sale_items: [],
  payments: [],
  refunds: [],
  refund_items: [],
  sale_voids: [],
  cashier_sessions: [
    {
      id: "50000000-0000-0000-0000-000000000001",
      cashier_id: staffId,
      status: "open",
    },
  ],
  held_orders: [],
  system_settings: [{ tax_bps: 0, cashier_discount_bps: 0 }],
  promotions: [],
  stock_movements: [],
  suppliers: [],
  purchase_orders: [],
  purchase_order_items: [],
  cash_movements: [],
  product_costs: [],
  sale_item_costs: [],
  profiles: [],
  audit_logs: [],
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: staffId,
          display_name: "Test owner",
          role: "owner",
          active: true,
        },
        tables,
      },
    }),
  );
  await page.goto("http://127.0.0.1:3001/");
});
test("Chinese product search, quantities, MYR discount and payment interface", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Point of sale", exact: true }),
  ).toBeVisible();
  const search = page.getByPlaceholder("Search products, SKU or scan barcode…");
  await search.fill("LF-02");
  await search.press("Enter");
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await expect(page.locator(".total-row").first()).toContainText("18.00");
  await page.getByRole("button", { name: "Increase LF-02" }).click();
  await expect(page.locator(".total-row").first()).toContainText("36.00");
  await page.getByLabel("Order discount", { exact: true }).fill("1.50");
  await expect(page.locator(".total-row").first()).toContainText("34.50");
  await page.getByRole("button", { name: /Charge/ }).click();
  await expect(
    page.getByRole("heading", { name: "Complete payment" }),
  ).toBeVisible();
  await expect(page.getByLabel("Cash received (RM)")).toHaveValue("34.5");
});
test("workspace fits viewport and restricted roles hide protected navigation", async ({
  page,
}) => {
  await expect(page.locator(".product-card")).toHaveCount(11);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/pos-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: staffId,
          display_name: "Cashier",
          role: "cashier",
          active: true,
        },
        tables: {
          ...tables,
          product_costs: undefined,
          sale_item_costs: undefined,
        },
      },
    }),
  );
  await page.reload();
  await expect(page.locator(".product-card")).toHaveCount(11);
  await expect(
    page.getByRole("button", { name: "Staff Management", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reports", exact: true }),
  ).toHaveCount(0);
});
