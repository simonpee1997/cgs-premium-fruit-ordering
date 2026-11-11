import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
const product = {
  id: "40000000-0000-4000-8000-000000000001",
  sku: "LF-02",
  name: "原味黄金呀菇",
  english_name: "Original Golden Arrowhead",
  price_sen: 1800,
  category: "Snacks",
  available: 20,
  image_url: null,
  description: null,
};
const store = {
  name: "CHIPSTI ENTERPRISE",
  ssm: "202603232290 (RA0139100-V)",
  enabled: true,
  allow_pickup: true,
  allow_delivery: true,
  allow_cash_pickup: true,
  pickup_address: "Test collection address",
  contact_phone: "0100000000",
  delivery_fee_sen: 500,
  delivery_postcode_prefixes: [],
  delivery_note: "Test delivery instructions",
  delivery_areas: [],
  bank_name: "Test Bank",
  bank_account_name: "Test Store",
  bank_account_number: "TEST-ONLY-ACCOUNT",
  duitnow_qr_url: "/branding/chipsti-duitnow.original.jpeg",
  bank_transfer_available: true,
  duitnow_available: true,
  tax_bps: 0,
};
const proofId = "70000000-0000-4000-8000-000000000001",
  claim = "71000000-0000-4000-8000-000000000001",
  orderToken = "72000000-0000-4000-8000-000000000001";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/f9sAAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("**/api/shop", (route) =>
    route.fulfill({ json: { store, products: [product] } }),
  );
  await page.route("**/api/shop/quote", (route) =>
    route.fulfill({ json: { total_sen: 1800, fee_sen: 0, tax_sen: 0 } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add LF-02 to basket", exact: true })
    .click();
  await page.getByRole("button", { name: "Open basket, 1 items" }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByLabel("Full name").fill("Test customer");
  await page.getByLabel("Contact number").fill("0100000000");
});
async function chooseQR(page: import("@playwright/test").Page) {
  await page.getByLabel("Online payment method").selectOption("duitnow");
  await expect(
    page.getByRole("img", {
      name: "Official CHIPSTI ENTERPRISE DuitNow QR — Touch 'n Go eWallet",
    }),
  ).toBeVisible();
}
async function mockUpload(page: import("@playwright/test").Page) {
  await page.route("**/api/shop/proof/prepare", (route) =>
    route.fulfill({
      json: {
        id: proofId,
        token: claim,
        filename: "receipt.png",
        ready: false,
        upload_url: `https://uploads.fixture.invalid/storage/v1/object/upload/sign/payment-proofs/${proofId}.png?token=TEST-WRITE-ONLY`,
      },
    }),
  );
  await page.route("https://uploads.fixture.invalid/**", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "PUT, OPTIONS",
        "access-control-allow-headers": "*",
      },
      json: { Key: `payment-proofs/${proofId}.png` },
    }),
  );
  await page.route("**/api/shop/proof/complete", (route) =>
    route.fulfill({
      json: { id: proofId, token: claim, filename: "receipt.png" },
    }),
  );
}
test("supplied logo, icons and original QR load without altering the QR bytes or proportions", async ({
  page,
  request,
}) => {
  await chooseQR(page);
  const image = page.getByRole("img", {
    name: "Official CHIPSTI ENTERPRISE DuitNow QR — Touch 'n Go eWallet",
  });
  await expect(image).toHaveAttribute(
    "src",
    "/branding/chipsti-duitnow.original.jpeg",
  );
  await expect(image).toHaveJSProperty("naturalWidth", 760);
  await expect(image).toHaveJSProperty("naturalHeight", 1080);
  const box = await image.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(760 / 1080, 2);
  await expect(
    page.getByRole("link", { name: "Save QR image" }),
  ).toHaveAttribute("download", /CHIPSTI/);
  const original = await request.get("/branding/chipsti-duitnow.original.jpeg");
  expect(
    createHash("sha256")
      .update(await original.body())
      .digest("hex"),
  ).toBe("3ea51f903b898f288906d94bc829449db5c410b4e223480f001935d0c82be5cd");
  await expect(page.locator(".shop-cart-heading .chipsti-logo")).toBeVisible();
  expect((await request.get("/favicon.ico")).ok()).toBe(true);
  expect(
    (await request.get("/apple-touch-icon.png")).headers()["content-type"],
  ).toContain("image/png");
  expect((await request.get("/branding/chipsti-social.jpg")).ok()).toBe(true);
  await image.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/qr-panel-${test.info().project.name}.png`,
    fullPage: false,
  });
});
test("QR order requires a private receipt and is shown as Pending Verification, never paid", async ({
  page,
}) => {
  await chooseQR(page);
  await mockUpload(page);
  await page
    .getByRole("checkbox", { name: /I agree to the order total/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Upload Payment Proof / 上传付款凭证")
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByText("Receipt uploaded. Payment is still pending verification."),
  ).toBeVisible();
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/shop/order", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      json: { token: orderToken, order_number: "WEB-TEST-QR" },
    });
  });
  await page.route("**/api/shop/status?*", (route) =>
    route.fulfill({
      json: {
        order_number: "WEB-TEST-QR",
        status: "payment_submitted",
        fulfillment: "pickup",
        created_at: "2026-11-06T01:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
        customer_name: "Test customer",
        address: "",
        postcode: "",
        subtotal_sen: 1800,
        delivery_fee_sen: 0,
        tax_sen: 0,
        total_sen: 1800,
        payment_method: "duitnow",
        payment_reference: "TEST-PROOF",
        payment_proof_received: true,
        receipt_number: null,
        cashier_name: null,
        confirmed_at: null,
        refunded_sen: 0,
        items: [
          {
            sku: product.sku,
            name: product.name,
            quantity: 1,
            unit_price_sen: 1800,
            total_sen: 1800,
          },
        ],
        store,
      },
    }),
  );
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pending Verification", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Thank you for ordering from CHIPSTI! Your order has been received. We will verify your payment and confirm your order shortly.",
    ),
  ).toBeVisible();
  expect(submitted?.proof_id).toBe(proofId);
  expect(submitted?.proof_token).toBe(claim);
  expect(submitted?.expected_total_sen).toBe(1800);
  await expect(
    page.getByText("Order summary · not a payment receipt"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Payment method \/ 付款方式: Touch ’n Go \/ DuitNow QR/),
  ).toBeVisible();
});
test("invalid and oversized uploads are rejected before private upload requests", async ({
  page,
}) => {
  await chooseQR(page);
  let calls = 0;
  await page.route("**/api/shop/proof/prepare", (route) => {
    calls++;
    return route.fulfill({ status: 400, json: { error: "Unexpected upload" } });
  });
  const input = page.getByLabel("Upload Payment Proof / 上传付款凭证");
  await input.setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("<script>bad receipt</script>"),
  });
  await expect(
    page.locator(".payment-proof-upload [role=alert]"),
  ).toContainText("content does not match");
  await input.setInputFiles({
    name: "big.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(
    page.locator(".payment-proof-upload [role=alert]"),
  ).toContainText("5 MB");
  expect(calls).toBe(0);
});
test("server price mismatch prevents displaying a payable QR or accepting proof", async ({
  page,
}) => {
  await page.route("**/api/shop/quote", (route) =>
    route.fulfill({ json: { total_sen: 1900 } }),
  );
  await page.getByLabel("Online payment method").selectOption("duitnow");
  await expect(
    page.getByText(
      "Prices or delivery charges changed. Refresh the collection before paying.",
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Upload Payment Proof / 上传付款凭证"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Official CHIPSTI ENTERPRISE DuitNow QR — Touch 'n Go eWallet",
    }),
  ).toHaveCount(0);
});
test("cash on collection remains available without a receipt upload", async ({
  page,
}) => {
  await expect(page.getByLabel("Online payment method")).toHaveValue("cash");
  await expect(
    page.getByLabel("Upload Payment Proof / 上传付款凭证"),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: /I agree to the order total/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeEnabled();
});
test("public proof endpoints reject foreign origins and private downloads require sign-in", async ({
  request,
}) => {
  for (const path of [
    "/api/shop/proof/prepare",
    "/api/shop/proof/complete",
    "/api/shop/quote",
  ]) {
    const response = await request.post(path, {
      headers: { origin: "https://attacker.invalid" },
      data: {},
    });
    expect(response.status()).toBe(403);
  }
  const response = await request.get(
    `http://127.0.0.1:3001/api/online-orders/proof?order_id=${proofId}`,
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("changing the basket invalidates an uploaded proof for the old total", async ({
  page,
}) => {
  await chooseQR(page);
  await mockUpload(page);
  await page
    .getByLabel("Upload Payment Proof / 上传付款凭证")
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByText("Receipt uploaded. Payment is still pending verification."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to basket", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add one LF-02", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to checkout", exact: true })
    .click();
  await page.route("**/api/shop/quote", (route) =>
    route.fulfill({ json: { total_sen: 3600 } }),
  );
  await chooseQR(page);
  await expect(
    page.getByText(
      "Your basket or delivery details changed. Upload proof for the updated order total.",
    ),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I agree to the order total/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Receipt uploaded. Payment is still pending verification."),
  ).toHaveCount(0);
});
