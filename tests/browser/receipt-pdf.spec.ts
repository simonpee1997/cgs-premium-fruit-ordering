import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const token = "60000000-0000-4000-8000-000000000001";
const saleId = "70000000-0000-4000-8000-000000000001";
const bank = {
  bank_name: "MAYBANK",
  bank_account_name: "512222906185",
  bank_account_number: "512222906185",
};
const line = {
  sku: "LF-02",
  name: "原味黄金呀菇",
  quantity: 1,
  unit_price_sen: 1800,
  total_sen: 1800,
};
function order(count = 1) {
  return {
    order_number: "WEB-PDF-TEST",
    receipt_number: "R-PDF-TEST",
    status: "paid",
    fulfillment: "pickup",
    created_at: "2026-11-10T01:00:00Z",
    confirmed_at: "2026-11-10T01:05:00Z",
    expires_at: "2026-11-11T01:00:00Z",
    customer_name: "Test customer",
    cashier_name: "Test cashier",
    subtotal_sen: 1800 * count,
    delivery_fee_sen: 0,
    tax_sen: 0,
    total_sen: 1800 * count,
    payment_method: "bank",
    refunded_sen: 0,
    items: Array.from({ length: count }, (_, i) => ({
      ...line,
      sku: count === 1 ? line.sku : `TEST-${i}`,
      english_name: "Original Golden Arrowhead",
    })),
    store: {
      ...bank,
      pickup_address: "Test address",
      contact_phone: "0147371434",
      delivery_note: "",
    },
  };
}
async function verifyDownload(download: import("@playwright/test").Download) {
  expect(download.suggestedFilename()).toMatch(/^CHIPSTI-.*\.pdf$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(10000);
  return bytes.toString("latin1");
}
test("customer downloads and shares the existing bilingual receipt with QR and saved bank details", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedAccount: string }).copiedAccount =
            value;
        },
      },
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: () => true,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as unknown as { sharedText?: string }).sharedText = data.text;
        (window as unknown as { sharedFile: string }).sharedFile =
          data.files?.[0]?.name || "";
      },
      configurable: true,
    });
  });
  await page.route("**/api/shop/status?*", (r) => r.fulfill({ json: order() }));
  await page.goto(`/order/${token}`);
  const receipt = page.locator(".shop-customer-receipt");
  await expect(receipt).toContainText("Payment receipt / 付款收据");
  await expect(receipt).toContainText("Original Golden Arrowhead");
  await expect(receipt).toContainText("原味黄金呀菇");
  await expect(receipt).toContainText("5122 2290 6185");
  await expect(
    receipt.getByAltText("Official CHIPSTI ENTERPRISE DuitNow payment QR"),
  ).toHaveAttribute("src", "/branding/chipsti-duitnow.original.jpeg");
  const displayed = page.locator(".receipt-bank-details").last();
  await expect(displayed.locator('[data-bank-field="bank"]')).toHaveText(
    "Maybank",
  );
  await expect(displayed.locator('[data-bank-field="name"]')).toHaveText(
    "CHIPSTI ENTERPRISE",
  );
  await expect(displayed.locator('[data-bank-field="number"]')).toHaveText(
    "5122 2290 6185",
  );
  const pending = page.waitForEvent("download");
  await receipt
    .getByRole("button", { name: "Download PDF / 下载 PDF", exact: true })
    .click();
  const download = await pending;
  await verifyDownload(download);
  await download.saveAs(`test-results/receipt-${test.info().project.name}.pdf`);
  await displayed
    .getByRole("button", {
      name: "Copy account number / 复制银行账号",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { copiedAccount: string }).copiedAccount,
      ),
    )
    .toBe("512222906185");
  await receipt
    .getByRole("button", { name: "Share PDF / 分享 PDF", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { sharedFile: string }).sharedFile,
      ),
    )
    .toBe("CHIPSTI-R-PDF-TEST.pdf");
  const sharedText = await page.evaluate(
    () => (window as unknown as { sharedText?: string }).sharedText,
  );
  expect(sharedText).toContain("WEB-PDF-TEST");
  expect(sharedText).toContain("Original Golden Arrowhead");
  expect(sharedText).not.toContain("https://chipsti.com/order/");
  await expect(
    receipt.getByRole("link", {
      name: "Open store WhatsApp / 打开商家 WhatsApp",
      exact: true,
    }),
  ).toHaveAttribute("href", /^https:\/\/wa.me\/60147371434\?text=/);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("long receipts produce multiple PDF pages without exporting controls", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.route("**/api/shop/status?*", (r) =>
    r.fulfill({ json: order(45) }),
  );
  await page.goto(`/order/${token}`);
  const displayed = page.locator(".receipt-bank-details").last();
  await expect(displayed.locator('[data-bank-field="bank"]')).toHaveText(
    "Maybank",
  );
  await expect(displayed.locator('[data-bank-field="name"]')).toHaveText(
    "CHIPSTI ENTERPRISE",
  );
  await expect(displayed.locator('[data-bank-field="number"]')).toHaveText(
    "5122 2290 6185",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download PDF / 下载 PDF", exact: true })
    .click();
  const download = await pending;
  const contents = await verifyDownload(download);
  const count =
    contents.match(
      /\/Type \/Pages\s*\/Kids \[[\s\S]*?\]\s*\/Count (\d+)/,
    )?.[1] || contents.match(/\/Count (\d+)/)?.[1];
  expect(Number(count)).toBeGreaterThan(1);
  await download.saveAs(
    `test-results/receipt-long-${test.info().project.name}.pdf`,
  );
});
test("POS receipt downloads with authorized saved payment details", async ({
  page,
}) => {
  test.setTimeout(90000);
  const tables: Record<string, unknown[]> = {};
  for (const name of [
    "products",
    "product_categories",
    "inventory",
    "customers",
    "sales",
    "sale_items",
    "payments",
    "refunds",
    "refund_items",
    "sale_voids",
    "cashier_sessions",
    "held_orders",
    "system_settings",
    "promotions",
    "stock_movements",
    "suppliers",
    "purchase_orders",
    "purchase_order_items",
    "cash_movements",
    "product_costs",
    "sale_item_costs",
    "profiles",
    "audit_logs",
  ])
    tables[name] = [];
  tables.system_settings = [{ tax_bps: 0, cashier_discount_bps: 0 }];
  tables.sales = [
    {
      id: saleId,
      receipt_number: "POS-PDF-TEST",
      created_at: "2026-11-10T01:00:00Z",
      cashier_name: "Test cashier",
      subtotal_sen: 1800,
      discount_sen: 0,
      tax_sen: 0,
      total_sen: 1800,
    },
  ];
  tables.sale_items = [
    { ...line, id: "item", sale_id: saleId, discount_sen: 0 },
  ];
  tables.payments = [
    {
      id: "payment",
      sale_id: saleId,
      method: "cash",
      amount_sen: 1800,
      tendered_sen: 2000,
      reference: "",
    },
  ];
  await page.route("**/api/data", (r) =>
    r.fulfill({
      json: {
        profile: {
          id: "test",
          display_name: "Test cashier",
          role: "cashier",
          active: true,
        },
        tables,
      },
    }),
  );
  await page.route("**/api/receipt-payment?*", (r) => {
    expect(r.request().url()).toContain(`sale_id=${saleId}`);
    return r.fulfill({ json: bank });
  });
  await page.goto("http://127.0.0.1:3001/admin");
  await expect(
    page.getByRole("heading", { name: "Point of sale", exact: true }),
  ).toBeVisible();
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "Sales History", exact: true })
    .click();
  await page.getByRole("button", { name: "View receipt", exact: true }).click();
  await expect(page.locator(".receipt")).toContainText("5122 2290 6185");
  const displayed = page.locator(".receipt-bank-details").last();
  await expect(displayed.locator('[data-bank-field="bank"]')).toHaveText(
    "Maybank",
  );
  await expect(displayed.locator('[data-bank-field="name"]')).toHaveText(
    "CHIPSTI ENTERPRISE",
  );
  await expect(displayed.locator('[data-bank-field="number"]')).toHaveText(
    "5122 2290 6185",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download PDF / 下载 PDF", exact: true })
    .click();
  const download = await pending;
  await verifyDownload(download);
  await download.saveAs(
    `test-results/receipt-pos-${test.info().project.name}.pdf`,
  );
  await expect(
    page.getByRole("button", { name: "Print receipt", exact: true }),
  ).toBeVisible();
});
