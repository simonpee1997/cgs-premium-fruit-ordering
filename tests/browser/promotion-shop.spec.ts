import { test, expect } from "@playwright/test";
const product = {
  id: "40000000-0000-4000-8000-000000000001",
  sku: "LF-02",
  name: "原味黄金呀菇",
  english_name: "Original Golden Arrowhead",
  price_sen: 5000,
  available: 30,
  category: "Snacks",
  image_url: null,
  description: "160g pack",
};
const store = {
  name: "CHIPSTI ENTERPRISE",
  ssm: "202603232290 (RA0139100-V)",
  enabled: true,
  allow_pickup: true,
  allow_delivery: true,
  allow_cash_pickup: true,
  pickup_address: "Test pickup address, Kuala Lumpur",
  contact_phone: "0100000000",
  delivery_fee_sen: 2000,
  delivery_postcode_prefixes: [],
  delivery_note: "Test configured coverage",
  bank_transfer_available: true,
  duitnow_available: true,
  tax_bps: 0,
  delivery_areas: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      name: "Test Klang Valley",
      postcodes: ["48000"],
      standard_fee_sen: 1500,
      free_delivery_eligible: true,
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/shop", (r) =>
    r.fulfill({ json: { store, products: [product] } }),
  );
  await page.route("**/api/shop/promotion", (r) => {
    const input = r.request().postDataJSON();
    if (input.code !== "CGSVIP20")
      return r.fulfill({ status: 400, json: { error: "Invalid promo code" } });
    const subtotal = input.items.reduce(
      (sum: number, l: { quantity: number }) => sum + l.quantity * 5000,
      0,
    );
    return r.fulfill({
      json: {
        code: "CGSVIP20",
        name: "Customer Special",
        percent_bps: 2000,
        discount_type: "percent",
        discount_sen: subtotal / 5,
        product_subtotal_sen: subtotal,
        subtotal_after_discount_sen: (subtotal * 4) / 5,
      },
    });
  });
  await page.goto("/");
});
async function openCart(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Open basket,/ }).click();
}
test("discount changes shipping eligibility, removal and submitted order totals", async ({
  page,
}) => {
  for (let i = 0; i < 7; i++)
    await page
      .getByRole("button", { name: "Add LF-02 to basket", exact: true })
      .click();
  await openCart(page);
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByLabel("Delivery area", { exact: true }).selectOption("48000");
  await page
    .getByLabel("Complete Malaysian delivery address")
    .fill("Test street address, Kuala Lumpur");
  await page.getByLabel("Have a promo code? / 有优惠码吗？").fill("cgsvip20");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText(/CGSVIP20 applied/)).toBeVisible();
  await expect(page.locator(".shop-grand-total")).toContainText("295.00");
  await expect(page.locator(".shop-totals")).toContainText("280.00");
  await page
    .getByRole("button", { name: "Add one LF-02", exact: true })
    .click();
  await expect(page.locator(".shop-grand-total")).toContainText("320.00");
  await expect(
    page.getByText("Congratulations! You've unlocked FREE DELIVERY!"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pickup", exact: true }).click();
  await expect(page.getByText("Pickup: " + store.pickup_address)).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to checkout", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Test customer");
  await page.getByLabel("Contact number", { exact: true }).fill("0100000000");
  await page.getByLabel(/I agree to the order total/).check();
  let received: Record<string, unknown> | undefined;
  await page.route("**/api/shop/order", (r) => {
    received = r.request().postDataJSON();
    return r.fulfill({
      status: 400,
      json: { error: "Test fixture: no real order created" },
    });
  });
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.locator(".shop-error[role=alert]")).toContainText(
    "Test fixture",
  );
  expect(received?.promo_code).toBe("CGSVIP20");
  expect(received?.expected_total_sen).toBe(32000);
  expect(received).not.toHaveProperty("discount_sen");
  await page
    .getByRole("button", { name: "Remove LF-02 from order", exact: true })
    .click();
  await expect(page.getByText("A fresh start.")).toBeVisible();
});
test("invalid codes block checkout and can be removed without changing quantities", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Add LF-02 to basket", exact: true })
    .click();
  await openCart(page);
  await page.getByLabel("Have a promo code? / 有优惠码吗？").fill("INVALID");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".shop-error[role=alert]")).toContainText(
    "Invalid promo",
  );
  await expect(
    page.getByRole("button", { name: "Continue to checkout" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Remove code INVALID", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue to checkout" }),
  ).toBeEnabled();
  await expect(page.locator(".shop-grand-total")).toContainText("50.00");
});
test("homepage shows products immediately and wide screens fit six columns", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route("**/api/shop", (r) =>
    r.fulfill({
      json: {
        store,
        products: Array.from({ length: 12 }, (_, i) => ({
          ...product,
          id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
          sku: `TEST-${i}`,
        })),
      },
    }),
  );
  await page.reload();
  await expect(page.locator(".shop-product")).toHaveCount(12);
  await expect(page.locator(".shop-hero")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "About", exact: true }),
  ).toHaveAttribute("href", "/about");
  const first = await page.locator(".shop-product").first().boundingBox();
  expect(first!.y).toBeLessThan(450);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "desktop") {
    const columns = await page
      .locator(".shop-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(columns).toBe(6);
    await expect(page.locator(".shop-cart")).toBeVisible();
  } else {
    await expect(
      page.getByRole("button", { name: "View cart, 0 items", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View cart, 0 items", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.screenshot({
    path: `test-results/product-first-${info.project.name}.png`,
    fullPage: true,
  });
});
