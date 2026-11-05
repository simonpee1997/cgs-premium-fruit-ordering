import { test, expect } from "@playwright/test";
test("setup screen is honest, accessible and responsive", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let’s open your store." }),
  ).toBeVisible();
  await expect(page.getByText("Database setup required")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/setup-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("manifest and service worker contain no financial offline cache", async ({
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  for (const size of [192, 512]) {
    const icon = await request.get(`/icon-${size}.png`);
    expect(icon.ok()).toBe(true);
    expect(icon.headers()["content-type"]).toContain("image/png");
    const bytes = await icon.body();
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  const worker = await request.get("/sw.js");
  expect(await worker.text()).not.toContain("caches.open");
});
test("mutation endpoint rejects foreign origins", async ({ request }) => {
  const response = await request.post("/api/action", {
    headers: { origin: "https://attacker.invalid" },
    data: { action: "checkout", payload: {} },
  });
  expect(response.status()).toBe(403);
});
