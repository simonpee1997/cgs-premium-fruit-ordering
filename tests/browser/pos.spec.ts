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
  await page.goto("http://127.0.0.1:3001/admin");
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

test("owner can configure pickup, delivery and payment details", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Point of sale", exact: true }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "Toggle navigation" }).isVisible())
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("button", { name: "Online Orders", exact: true })
    .click();
  await expect(page.getByText("Online ordering is paused")).toBeVisible();
  await page
    .getByRole("button", { name: "Online shop settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Online shop settings" });
  await dialog
    .getByLabel("Pickup address", { exact: true })
    .fill("Test collection address, Kuala Lumpur");
  await dialog
    .getByLabel("Delivery instructions / estimated timing")
    .fill("Test delivery instructions");
  await dialog.getByLabel("Flat delivery fee (RM)").fill("5.00");
  await dialog.getByLabel("Bank name", { exact: true }).fill("Test Bank");
  await dialog
    .getByLabel("Bank account holder", { exact: true })
    .fill("Test Store");
  await dialog
    .getByLabel("Bank account number", { exact: true })
    .fill("TEST-ONLY-ACCOUNT");
  await dialog.getByLabel("Enable online orders", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Add delivery area", exact: true })
    .click();
  await dialog.getByLabel("Area 1 name", { exact: true }).fill("Test KV area");
  await dialog
    .getByLabel("Area 1 postcodes (comma-separated)", { exact: true })
    .fill("50000, 50050");
  await dialog
    .getByLabel("Area 1 standard delivery fee (RM)", { exact: true })
    .fill("8.00");
  await dialog
    .getByRole("checkbox", {
      name: "Area 1 is in Klang Valley and eligible for free delivery at RM300",
    })
    .check();
  await dialog
    .getByRole("button", { name: "Add delivery area", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remove area 2", exact: true })
    .click();

  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/online-orders", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { id: null } });
  });
  await dialog
    .getByRole("button", { name: "Save online shop settings" })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(submitted?.operation).toBe("configure");
  expect(
    (submitted?.settings as { delivery_areas: unknown[] }).delivery_areas,
  ).toEqual([
    {
      id: expect.any(String),
      name: "Test KV area",
      postcodes: ["50000", "50050"],
      standard_fee_sen: 800,
      free_delivery_eligible: true,
    },
  ]);

  expect(
    (submitted?.settings as { delivery_fee_sen: number }).delivery_fee_sen,
  ).toBe(500);
  expect(
    (submitted?.settings as { allow_delivery: boolean }).allow_delivery,
  ).toBe(true);
});

test("admin confirms funds explicitly before recording a customer order as paid", async ({
  page,
}) => {
  const id = "70000000-0000-0000-0000-000000000001";
  let state = {
    ...tables,
    online_orders: [
      {
        id,
        order_number: "WEB-TEST-000001",
        customer_name: "Test customer",
        phone: "0100000000",
        email: null,
        fulfillment: "delivery",
        address: "Test delivery address",
        postcode: "50000",
        notes: "Test only",
        status: "payment_submitted",
        expires_at: "2099-01-01T00:00:00Z",
        created_at: "2026-11-05T01:00:00Z",
        total_sen: 2300,
        delivery_fee_sen: 500,
        tax_sen: 0,
        payment_method: "bank",
        payment_reference: "TEST-REF",
        sale_id: null as string | null,
        tracking_token: "60000000-0000-0000-0000-000000000001",
      },
    ],
    online_order_items: [
      {
        id: "71000000-0000-0000-0000-000000000001",
        order_id: id,
        product_id: products[0].id,
        sku: "LF-02",
        name: products[0].name,
        quantity: 1,
        total_sen: 1800,
      },
    ],
  };
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: staffId,
          display_name: "Test owner",
          role: "owner",
          active: true,
        },
        tables: state,
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Point of sale", exact: true }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "Toggle navigation" }).isVisible())
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("button", { name: "Online Orders", exact: true })
    .click();
  await page.getByRole("button", { name: "Review order" }).click();
  const dialog = page.getByRole("dialog", { name: "Review online order" });
  await expect(
    dialog.getByLabel("Verified bank / payment reference"),
  ).toHaveValue("TEST-REF");
  await dialog
    .getByRole("checkbox", {
      name: "I checked that the full payment was received.",
    })
    .check();
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/online-orders", async (route) => {
    submitted = route.request().postDataJSON();
    state = {
      ...state,
      online_orders: [
        {
          ...state.online_orders[0],
          status: "paid",
          sale_id: "80000000-0000-0000-0000-000000000001",
        },
      ],
    };
    await route.fulfill({ json: { id: state.online_orders[0].sale_id } });
  });
  await dialog
    .getByRole("button", { name: "Confirm payment & create sale" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Mark dispatched" }),
  ).toBeVisible();
  expect(submitted?.operation).toBe("confirm_payment");
  expect(submitted?.verified).toBe(true);
  expect(submitted?.tendered_sen).toBe(2300);
});
