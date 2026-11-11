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
  delivery_note: "Klang Valley Mon to Saturday. Next day delivery",
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
  await expect(page.getByLabel("Search collection")).toHaveAttribute(
    "placeholder",
    "Search products...",
  );
  await expect(page.getByText(/Klang Valley Mon to Saturday/i)).toHaveCount(0);
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
  await page.getByLabel("Search collection").fill("LF-02");
  await expect(page.locator(".shop-product")).toHaveCount(1);
});
test("customer can request delivery, see exact fees and submit a manual payment reference", async ({
  page,
}) => {
  const token = "60000000-0000-0000-0000-000000000001";
  let handoffs = 0;
  await page.route("https://wa.me/**", (route) => {
    handoffs++;
    return route.fulfill({
      contentType: "text/html",
      body: "<h1>WhatsApp test handoff</h1>",
    });
  });
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
  await expect(page.getByText(/Klang Valley Mon to Saturday/i)).toHaveCount(0);
  await page.getByLabel("Full name").fill("Test customer");
  await page.getByLabel("Contact number").fill("0100000000");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
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
  await expect(page).toHaveURL(/^https:\/\/wa.me\/60100000000\?text=/);
  const automaticMessage = new URL(page.url()).searchParams.get("text")!;
  expect(automaticMessage).toContain("WEB-TEST-000001");
  expect(automaticMessage).toContain("24.38");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/order/${token}`));
  expect(new URL(page.url()).hash).toBe("");
  expect(handoffs).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Order received", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".shop-customer-receipt")).toContainText(
    "Original Golden Arrowhead",
  );
  await expect(page.locator(".shop-customer-receipt")).toContainText(
    "原味黄金呀菇",
  );
  await expect(page.locator(".shop-customer-receipt")).toContainText(
    "Total / 总计",
  );
  await expect(page.getByText(/Save this private order link/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh status", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payment instructions", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Klang Valley Mon to Saturday/i)).toHaveCount(0);
  const whatsappHref = await page
    .getByRole("link", {
      name: "Send order to WhatsApp / WhatsApp 发送订单",
      exact: true,
    })
    .getAttribute("href");
  const whatsapp = new URL(whatsappHref!);
  expect(whatsapp.origin).toBe("https://wa.me");
  expect(whatsapp.pathname).toBe("/60100000000");
  expect(whatsapp.searchParams.get("text")).toContain("WEB-TEST-000001");
  expect(whatsapp.searchParams.get("text")).toContain(
    "Original Golden Arrowhead",
  );
  expect(whatsapp.searchParams.get("text")).toContain("24.38");
  expect(whatsapp.searchParams.get("text")).toContain(
    "https://chipsti.com/order/" + token,
  );
  expect(submitted?.expected_total_sen).toBe(2438);
  expect(submitted?.fulfillment).toBe("delivery");
  expect(submitted).not.toHaveProperty("unit_price_sen");
  await expect(
    page.getByText("Order summary · not a payment receipt"),
  ).toBeVisible();
  await expect(
    page.locator(".shop-bank").getByText("Test Bank", { exact: true }),
  ).toBeVisible();
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

test("quantity controls stay independent, honor stock and synchronize across filters and basket", async ({
  page,
}) => {
  await page.route("**/api/shop", (route) =>
    route.fulfill({
      json: {
        store,
        products: products.map((p, i) => ({
          ...p,
          category: i === 1 ? "Gifts" : "Snacks",
        })),
      },
    }),
  );
  await page.reload();
  const group = page.getByRole("group", {
    name: "LF-02 quantity",
    exact: true,
  });
  await expect(group.getByRole("status")).toHaveText("0");
  await expect(
    group.getByRole("button", {
      name: "Remove LF-02 from basket",
      exact: true,
    }),
  ).toBeDisabled();
  for (let n = 0; n < 5; n++)
    await group
      .getByRole("button", { name: "Add LF-02 to basket", exact: true })
      .click();
  await expect(group.getByRole("status")).toHaveText("5");
  await expect(
    group.getByRole("button", { name: "Add LF-02 to basket", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Open basket, 5 items" }).click();
  await expect(page.locator(".shop-cart-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Remove one LF-02", exact: true })
    .click();
  await expect(page.locator(".shop-cart-item .shop-quantity span")).toHaveText(
    "4",
  );
  await page.getByRole("button", { name: "Close basket" }).click();
  await expect(group.getByRole("status")).toHaveText("4");
  await page
    .locator(".shop-categories")
    .getByRole("button", { name: "Gifts", exact: true })
    .click();
  await expect(group).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add LF-05 to basket", exact: true })
    .click();
  await page
    .locator(".shop-categories")
    .getByRole("button", { name: "All products", exact: true })
    .click();
  await page.getByLabel("Search collection").fill("LF-02");
  await expect(group.getByRole("status")).toHaveText("4");
  await page.getByLabel("Search collection").fill("");
  await expect(
    page
      .getByRole("group", { name: "LF-05 quantity", exact: true })
      .getByRole("status"),
  ).toHaveText("1");
  await page
    .getByRole("button", { name: "Remove LF-05 from basket", exact: true })
    .click();
  await page.getByRole("button", { name: "Open basket, 4 items" }).click();
  await expect(page.locator(".shop-cart-item")).toHaveCount(1);
  for (let n = 0; n < 4; n++)
    await page
      .getByRole("button", { name: "Remove one LF-02", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "A fresh start.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close basket" }).click();
  await expect(group.getByRole("status")).toHaveText("0");
  const size = await group.getByRole("button").first().boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
});
const deliveryAreas = [
  {
    id: "90000000-0000-4000-8000-000000000001",
    name: "Test KV area",
    postcodes: ["50000"],
    standard_fee_sen: 800,
    free_delivery_eligible: true,
  },
  {
    id: "90000000-0000-4000-8000-000000000002",
    name: "Test outside KV",
    postcodes: ["80000"],
    standard_fee_sen: 1500,
    free_delivery_eligible: false,
  },
];
test("delivery promotion updates with address, quantities, outside areas and pickup", async ({
  page,
}) => {
  await page.route("**/api/shop", (route) =>
    route.fulfill({
      json: {
        store: {
          ...store,
          delivery_areas: deliveryAreas,
          delivery_postcode_prefixes: [],
        },
        products: products.map((p) => ({ ...p, price_sen: 10000 })),
      },
    }),
  );
  await page.reload();
  await expect(page.locator(".shop-delivery-banner")).toContainText(
    "Spend RM300 & above within Klang Valley",
  );
  for (let n = 0; n < 3; n++)
    await page
      .getByRole("button", { name: "Add LF-02 to basket", exact: true })
      .click();
  await page.getByRole("button", { name: "Open basket, 3 items" }).click();
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(
    page.getByText(
      "Select your delivery area to check free delivery eligibility.",
    ),
  ).toBeVisible();
  await page.getByLabel("Delivery area", { exact: true }).selectOption("50000");
  await expect(
    page.getByText(
      "Select your delivery area to check free delivery eligibility.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Complete Malaysian delivery address")
    .fill("Test-only unit and delivery street, Kuala Lumpur");
  await expect(
    page.getByText("Congratulations! You've unlocked FREE DELIVERY!"),
  ).toBeVisible();
  await expect(page.locator(".shop-grand-total")).toContainText("318.00");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "30000",
  );
  await page
    .getByRole("button", { name: "Remove one LF-02", exact: true })
    .click();
  await expect(page.getByText(/Add RM\s?100.00 more/)).toBeVisible();
  await expect(page.locator(".shop-grand-total")).toContainText("220.48");
  await page
    .getByRole("button", { name: "Add one LF-02", exact: true })
    .click();
  await page.getByLabel("Delivery area", { exact: true }).selectOption("80000");
  await expect(
    page.getByText("Free delivery is available within Klang Valley only."),
  ).toBeVisible();
  await expect(page.locator(".shop-grand-total")).toContainText("333.90");
  await page.getByLabel("Postcode", { exact: true }).fill("50100");
  await expect(page.locator(".shop-grand-total")).toContainText("323.30");
  await page.getByRole("button", { name: "Pickup", exact: true }).click();
  await expect(page.getByText("Pickup has no delivery fee.")).toBeVisible();
  await expect(page.locator(".shop-grand-total")).toContainText("318.00");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(page.getByLabel("Postcode", { exact: true })).toHaveValue(
    "50100",
  );
  await expect(page.locator(".shop-grand-total")).toContainText("323.30");
  await page.getByLabel("Delivery area", { exact: true }).selectOption("50000");
  await expect(page.locator(".shop-grand-total")).toContainText("318.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/delivery-${test.info().project.name}.png`,
    fullPage: true,
  });
});
for (const [price, fee] of [
  [29999, 800],
  [30000, 0],
]) {
  test(`checkout independently sends the ${price} sen threshold total to the server`, async ({
    page,
  }) => {
    await page.route("**/api/shop", (route) =>
      route.fulfill({
        json: {
          store: { ...store, tax_bps: 0, delivery_areas: deliveryAreas },
          products: products.map((p) => ({ ...p, price_sen: price })),
        },
      }),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Add LF-02 to basket", exact: true })
      .click();
    await page.getByRole("button", { name: "Open basket, 1 items" }).click();
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await page.getByLabel("Full name").fill("Test customer");
    await page.getByLabel("Contact number").fill("0100000000");
    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    await page
      .getByLabel("Delivery area", { exact: true })
      .selectOption("50000");
    await page
      .getByLabel("Complete Malaysian delivery address")
      .fill("Test-only unit and delivery street, Kuala Lumpur");
    await page
      .getByRole("checkbox", { name: /I agree to the order total/ })
      .check();
    let payload: Record<string, unknown> | undefined;
    await page.route("**/api/shop/order", async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 400,
        json: { error: "Test-only stop after validating the request" },
      });
    });
    await page
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    await expect(
      page.getByText("Test-only stop after validating the request"),
    ).toBeVisible();
    expect(payload?.expected_total_sen).toBe(price + fee);
    expect(payload?.postcode).toBe("50000");
    expect(payload).not.toHaveProperty("delivery_fee_sen");
  });
}

test("catalogue without promotion migrations supports checkout without promotion RPCs", async ({
  page,
}) => {
  const promotionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/shop/promotion"))
      promotionRequests.push(request.url());
  });
  await page
    .getByRole("button", { name: "Add LF-02 to basket", exact: true })
    .click();
  await page.getByRole("button", { name: "Open basket, 1 items" }).click();
  await expect(page.getByPlaceholder("Enter promo code")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue to checkout" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  expect(promotionRequests).toEqual([]);
});
for (const price of [29999, 30000]) {
  test(`nationwide delivery to Sarawak quotes ${price} sen product subtotal correctly`, async ({
    page,
  }) => {
    await page.route("**/api/shop", (route) =>
      route.fulfill({
        json: {
          store: {
            ...store,
            tax_bps: 0,
            delivery_fee_sen: 3000,
            delivery_areas: [],
            delivery_postcode_prefixes: [],
            free_delivery_all_postcodes: true,
          },
          products: products.map((p) => ({ ...p, price_sen: price })),
        },
      }),
    );
    await page.reload();
    await expect(page.locator(".shop-delivery-banner")).toContainText(
      "nationwide",
    );
    await page
      .getByRole("button", { name: "Add LF-02 to basket", exact: true })
      .click();
    await page.getByRole("button", { name: "Open basket, 1 items" }).click();
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await page.getByLabel("Full name").fill("Test customer");
    await page.getByLabel("Contact number").fill("0100000000");
    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    await page
      .getByLabel("Complete Malaysian delivery address")
      .fill("Complete test address in Kuching, Sarawak");
    await page.getByLabel("Postcode", { exact: true }).fill("93000");
    await expect(page.locator(".shop-grand-total")).toContainText(
      price === 30000 ? "300.00" : "329.99",
    );
    if (price === 30000)
      await expect(
        page.getByText("Congratulations! You've unlocked FREE DELIVERY!"),
      ).toBeVisible();
    let payload: Record<string, unknown> | undefined;
    await page.route("**/api/shop/order", async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 400,
        json: { error: "Test-only stop before order creation" },
      });
    });
    await page
      .getByRole("checkbox", { name: /I agree to the order total/ })
      .check();
    await page
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    await expect(
      page.getByText("Test-only stop before order creation"),
    ).toBeVisible();
    expect(payload?.postcode).toBe("93000");
    expect(payload?.expected_total_sen).toBe(
      price + (price >= 30000 ? 0 : 3000),
    );
    expect(payload).not.toHaveProperty("delivery_fee_sen");
  });
}
