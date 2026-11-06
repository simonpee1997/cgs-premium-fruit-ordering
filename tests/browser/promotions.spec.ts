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

const promo = {
  id: "80000000-2026-4000-8000-000000000020",
  name: "Cili Gemuk Selayang Customer Special",
  code: "CGSVIP20",
  discount_type: "percent",
  percent_bps: 2000,
  fixed_discount_sen: 0,
  starts_at: "2026-11-05T16:00:00Z",
  ends_at: "2026-11-30T15:59:59Z",
  publication_status: "draft",
  version: 1,
  minimum_spend_sen: 0,
  discount_cap_sen: null,
  max_redemptions: null,
  eligible_product_ids: [],
  eligible_category_ids: [],
  excluded_product_ids: [],
  excluded_category_ids: [],
  allow_manual_stacking: false,
  status: "Draft",
  redemptions: 0,
  reserved: 0,
  total_discount_sen: 0,
  associated_sales_sen: 0,
  net_sales_sen: 0,
};
test("owner reviews, creates and saves a guest promotion in Malaysia time", async ({
  page,
}) => {
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/data", (r) =>
    r.fulfill({
      json: {
        profile: {
          id: staffId,
          display_name: "Owner",
          role: "owner",
          active: true,
        },
        tables,
      },
    }),
  );
  await page.route("**/api/promotions", async (r) => {
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { result: promo.id } });
    }
    return r.fulfill({
      json: {
        server_time: "2026-11-06T12:00:00Z",
        offers: [promo],
        redemptions: [],
      },
    });
  });
  await page.goto("http://127.0.0.1:3001/admin");
  await expect(
    page.getByRole("heading", { name: "Point of sale", exact: true }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "Toggle navigation" }).isVisible())
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Marketing", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Promotions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("CGSVIP20 · v1", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/reserved for Phase 2/)).toBeVisible();
  await page
    .getByRole("button", { name: "Create New Offer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Promotion name", { exact: true })
    .fill("Weekend special");
  await dialog.getByLabel("Promo code", { exact: true }).fill("WEEKEND20");
  await dialog.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Offer saved");
  expect(saved?.operation).toBe("save");
  expect((saved?.offer as Record<string, unknown>).publish).toBe(false);
  expect((saved?.offer as Record<string, unknown>).starts_at).toBe(
    "2026-11-06T12:00:00.000Z",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("promotion endpoints reject cross-origin and customer-supplied price/time", async ({
  request,
}) => {
  for (const path of ["/api/promotions", "/api/shop/promotion"]) {
    const response = await request.post(path, {
      headers: { Origin: "https://foreign.invalid" },
      data: {},
    });
    expect(response.status()).toBe(403);
  }
  const invalid = await request.post("/api/shop/promotion", {
    // Next start binds 0.0.0.0 in this local test configuration.
    headers: { Origin: "http://0.0.0.0:3000" },
    data: {
      code: "CGSVIP20",
      items: [{ product_id: products[0].id, quantity: 1 }],
      at: "2026-11-06T00:00:00Z",
      discount_sen: 1,
    },
  });
  expect(invalid.status()).toBe(400);
});
