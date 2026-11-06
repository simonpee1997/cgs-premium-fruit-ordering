import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  onlineOrderSchema,
  onlineSettingsSchema,
} from "../src/lib/shop-validation";
let db: PGlite,
  product: string,
  first: { token: string; order_number: string },
  delivery: { token: string; order_number: string },
  deliveryId: string,
  sale: string;
const owner = "30000000-0000-0000-0000-000000000001",
  cashier = "30000000-0000-0000-0000-000000000002";
const bucket = "a".repeat(64);
const settings = {
  enabled: true,
  allow_pickup: true,
  allow_delivery: true,
  allow_cash_pickup: true,
  pickup_address: "Test-only collection address, Kuala Lumpur",
  contact_phone: "0100000000",
  delivery_fee_sen: 500,
  delivery_postcode_prefixes: ["50"],
  delivery_note: "Test delivery within configured postcode areas",
  bank_name: "Test Bank",
  bank_account_name: "Test Store",
  bank_account_number: "TEST-ONLY-ACCOUNT",
  duitnow_qr_url: "",
};
async function who(id: string | null, role = "authenticated") {
  await db.exec(
    `reset role;select set_config('test.uid','${id ?? ""}',false);set role ${role};`,
  );
}
async function rpc<T = string>(name: string, values: unknown[]) {
  const placeholders = values
    .map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`)
    .join(",");
  return (
    await db.query<{ result: T }>(
      `select ${name}(${placeholders}) result`,
      values.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
async function manage(action: string, payload: object) {
  return rpc("manage_online_order", [action, payload]);
}
async function availability() {
  return (
    await db.query<{ product_id: string; available: number; reserved: number }>(
      "select * from stock_availability()",
    )
  ).rows;
}
const orderPayload = (extra: Record<string, unknown> = {}) => ({
  key: crypto.randomUUID(),
  expected_total_sen: 3816,
  name: "Test customer",
  phone: "0100000000",
  email: "test@example.invalid",
  fulfillment: "pickup",
  address: "",
  postcode: "",
  notes: "Automated test only",
  payment_method: "cash",
  website: "",
  items: [{ product_id: product, quantity: 2 }],
  ...extra,
});
async function place(payload: object) {
  await who(null, "service_role");
  return rpc<{ token: string; order_number: string }>("place_online_order", [
    payload,
    bucket,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  const source = readFileSync("tests/database.test.ts", "utf8");
  const bootstrap = source.match(/`(create role anon;[^`]+)`/)![1];
  await db.exec(bootstrap);
  for (const name of [
    "001_core.sql",
    "002_voids.sql",
    "003_metadata.sql",
    "004_online_store.sql",
    "006_delivery_areas.sql",
    "007_payment_proofs.sql",
    "008_promotion_management.sql",
    "009_promotion_checkout.sql",
  ])
    await db.exec(
      readFileSync("supabase/migrations/" + name, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}'),('${cashier}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Test owner','20000000-0000-0000-0000-000000000001','owner'),('${cashier}','Test cashier','20000000-0000-0000-0000-000000000001','cashier');`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Public shop validation", () => {
  it("rejects invalid delivery addresses, fractional quantities and delivery cash", () => {
    expect(
      onlineOrderSchema.safeParse(
        orderPayload({
          fulfillment: "delivery",
          address: "x",
          postcode: "1",
          payment_method: "cash",
        }),
      ).success,
    ).toBe(false);
    expect(
      onlineOrderSchema.safeParse(
        orderPayload({ items: [{ product_id: product, quantity: 1.5 }] }),
      ).success,
    ).toBe(false);
    expect(
      onlineOrderSchema.safeParse(orderPayload({ website: "bot.invalid" }))
        .success,
    ).toBe(false);
  });
  it("does not enable delivery without a usable payment method", () => {
    expect(
      onlineSettingsSchema.safeParse({ ...settings, bank_account_number: "" })
        .success,
    ).toBe(false);
  });
});
describe("PostgreSQL online orders and POS integration", () => {
  it("exposes only public product data, with ordering disabled until configured", async () => {
    await who(null, "anon");
    const data = await rpc<{
      store: { enabled: boolean };
      products: Record<string, unknown>[];
    }>("shop_catalogue", []);
    expect(data.store.enabled).toBe(false);
    expect(data.store).not.toHaveProperty("bank_account_number");
    expect(data.products).toHaveLength(11);
    expect(data.products[0]).not.toHaveProperty("cost_sen");
    await expect(db.query("select * from products")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("select * from online_orders")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      rpc("place_online_order", [orderPayload(), bucket]),
    ).rejects.toThrow(/permission denied/);
  });
  it("keeps online order management private to managers/owners", async () => {
    await who(cashier);
    await expect(manage("configure", settings)).rejects.toThrow(
      /Permission denied/,
    );
    await expect(
      rpc("retail_action_before_shop", ["open_session", { opening_sen: 0 }]),
    ).rejects.toThrow(/permission denied/);
  });
  it("configures the store and actual stock through audited owner operations", async () => {
    await who(owner);
    await manage("configure", settings);
    await rpc("retail_action", [
      "adjust_stock",
      {
        product_id: product,
        quantity: 5,
        type: "stock-in",
        reason: "Automated test stock",
      },
    ]);
    await rpc("retail_action", [
      "settings",
      { tax_bps: 600, cashier_discount_bps: 0 },
    ]);
    await rpc("retail_action", ["open_session", { opening_sen: 0 }]);
  });
  it("reserves stock without creating a paid sale, and safely returns duplicate submissions", async () => {
    const payload = orderPayload();
    first = await place(payload);
    expect(await place(payload)).toEqual(first);
    await expect(place({ ...payload, notes: "Changed order" })).rejects.toThrow(
      /different order/,
    );
    await who(owner);
    const stock = await availability();
    expect(
      stock.find((s) => s.available === 3 && s.reserved === 2),
    ).toBeDefined();
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(5);
  });
  it("prevents POS sales and stock adjustments from consuming reserved units", async () => {
    await who(owner);
    await expect(
      rpc("checkout", [
        {
          key: crypto.randomUUID(),
          items: [{ product_id: product, quantity: 4 }],
          discount_kind: "fixed",
          discount_value: 0,
          payments: [
            {
              method: "bank",
              amount_sen: 7632,
              tendered_sen: 7632,
              reference: "TEST",
            },
          ],
        },
      ]),
    ).rejects.toThrow(/reserved/);
    await expect(
      rpc("retail_action", [
        "adjust_stock",
        {
          product_id: product,
          quantity: -4,
          type: "damaged",
          reason: "Must not consume reservations",
        },
      ]),
    ).rejects.toThrow(/reserved/);
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
  });
  it("rejects unavailable stock, stale totals, duplicate product lines and disallowed postcodes", async () => {
    await expect(
      place(
        orderPayload({
          items: [{ product_id: product, quantity: 4 }],
          expected_total_sen: 7632,
        }),
      ),
    ).rejects.toThrow(/stock/);
    await expect(
      place(orderPayload({ expected_total_sen: 1 })),
    ).rejects.toThrow(/Prices/);
    await expect(
      place(
        orderPayload({
          items: [
            { product_id: product, quantity: 1 },
            { product_id: product, quantity: 1 },
          ],
        }),
      ),
    ).rejects.toThrow(/Duplicate/);
    await expect(
      place(
        orderPayload({
          fulfillment: "delivery",
          address: "Test address in Malaysia",
          postcode: "58000",
          payment_method: "bank",
          expected_total_sen: 4346,
        }),
      ),
    ).rejects.toThrow(/postcode/);
  });
  it("releases cancelled reservations without altering physical stock", async () => {
    await who(owner);
    const id = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [first.token],
      )
    ).rows[0].id;
    await manage("cancel", { id, reason: "Test cancellation" });
    expect(
      (await availability()).find((i) => i.product_id === product)?.available,
    ).toBe(5);
  });
  it("expires unpaid reservations and refuses late payment confirmation", async () => {
    const placed = await place(
      orderPayload({
        items: [{ product_id: product, quantity: 1 }],
        expected_total_sen: 1908,
      }),
    );
    await db.exec("reset role;");
    await db.query(
      "update online_orders set expires_at=now()-interval '1 minute' where tracking_token=$1",
      [placed.token],
    );
    const id = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [placed.token],
      )
    ).rows[0].id;
    await who(null, "service_role");
    expect(
      (await rpc<{ status: string }>("online_order_status", [placed.token]))
        .status,
    ).toBe("expired");
    await who(owner);
    await expect(
      manage("confirm_payment", { id, verified: true }),
    ).rejects.toThrow(/expired/);
    expect(
      (await availability()).find((i) => i.product_id === product)?.available,
    ).toBe(5);
  });
  it("records a delivery request and customer payment reference without treating it as paid", async () => {
    delivery = await place(
      orderPayload({
        fulfillment: "delivery",
        address: "Test delivery address, Kuala Lumpur",
        postcode: "50000",
        payment_method: "bank",
        expected_total_sen: 4346,
      }),
    );
    await rpc("submit_online_payment", [delivery.token, "TEST-TRANSFER-1"]);
    expect(
      (await rpc<{ status: string }>("online_order_status", [delivery.token]))
        .status,
    ).toBe("payment_submitted");
    await expect(
      rpc("submit_online_payment", [delivery.token, "CHANGED-REF"]),
    ).rejects.toThrow(/already submitted/);
    await who(owner);
    deliveryId = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [delivery.token],
      )
    ).rows[0].id;
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
    await who(null, "anon");
    await expect(rpc("online_order_status", [delivery.token])).rejects.toThrow(
      /permission denied/,
    );
  });
  it("keeps the quoted prices/tax when paid, snapshots current cost, and creates a single receipt", async () => {
    await who(owner);
    await rpc("retail_action", [
      "product",
      {
        id: product,
        sku: "LF-02",
        name: "原味黄金呀菇",
        price_sen: 2200,
        cost_sen: 1000,
        low_stock: 5,
        archived: false,
      },
    ]);
    await rpc("retail_action", [
      "settings",
      { tax_bps: 0, cashier_discount_bps: 0 },
    ]);
    await expect(
      manage("confirm_payment", {
        id: deliveryId,
        reference: "VERIFIED-TRANSFER",
      }),
    ).rejects.toThrow(/verified payment/);
    sale = await manage("confirm_payment", {
      id: deliveryId,
      reference: "VERIFIED-TRANSFER",
      tendered_sen: 4346,
      verified: true,
    });
    expect(
      await manage("confirm_payment", {
        id: deliveryId,
        reference: "VERIFIED-TRANSFER",
        tendered_sen: 4346,
        verified: true,
      }),
    ).toBe(sale);
    const row = (
      await db.query<{ total_sen: number; tax_sen: number }>(
        "select total_sen,tax_sen from sales where id=$1",
        [sale],
      )
    ).rows[0];
    expect(row).toEqual({ total_sen: 4346, tax_sen: 246 });
    expect(
      (
        await db.query<{ n: number }>(
          "select sum(total_sen)::int n from sale_items where sale_id=$1",
          [sale],
        )
      ).rows[0].n,
    ).toBe(4100);
    const cost = (
      await db.query<{ cost_sen: number }>(
        "select cost_sen from sale_item_costs c join sale_items i on i.id=c.sale_item_id where i.sale_id=$1 and i.product_id=$2",
        [sale, product],
      )
    ).rows[0];
    expect(cost.cost_sen).toBe(1000);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(3);
  });
  it("allows fulfillment only after payment, and protects completed orders", async () => {
    await who(owner);
    await manage("fulfill", { id: deliveryId, status: "dispatched" });
    await manage("fulfill", { id: deliveryId, status: "completed" });
    await expect(
      manage("fulfill", { id: deliveryId, status: "dispatched" }),
    ).rejects.toThrow(/backwards/);
    await expect(
      manage("cancel", {
        id: deliveryId,
        reason: "Do not silently cancel paid sales",
      }),
    ).rejects.toThrow(/refunded/);
  });
  it("refunds delivery without creating stock and voids the remainder exactly", async () => {
    await who(owner);
    const shipping = (
      await db.query<{ id: string }>(
        "select id from sale_items where sale_id=$1 and product_id is null",
        [sale],
      )
    ).rows[0].id;
    await rpc("retail_action", [
      "refund",
      {
        key: crypto.randomUUID(),
        sale_id: sale,
        sale_item_id: shipping,
        quantity: 1,
        method: "bank",
        reason: "Test delivery refund",
        restock: true,
      },
    ]);
    expect(
      (
        await db.query<{ restock: boolean }>(
          "select restock from refund_items where sale_item_id=$1",
          [shipping],
        )
      ).rows[0].restock,
    ).toBe(false);
    await rpc("void_sale", [
      {
        sale_id: sale,
        method: "bank",
        reason: "Reverse test sale",
        restock: true,
      },
    ]);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(5);
    expect(
      (
        await db.query<{ n: number }>(
          "select sum(total_sen)::int n from refunds where sale_id=$1",
          [sale],
        )
      ).rows[0].n,
    ).toBe(4346);
    await who(null, "service_role");
    const state = await rpc<{ status: string; refunded_sen: number }>(
      "online_order_status",
      [delivery.token],
    );
    expect(state.status).toBe("refunded");
    expect(state.refunded_sen).toBe(4346);
  });
  it("persists request throttling and prevents unrelated public reads", async () => {
    await who(null, "service_role");
    const fresh = "f".repeat(64);
    for (let n = 0; n < 20; n++)
      expect(await rpc("shop_allow_request", [fresh])).toBe(true);
    expect(await rpc("shop_allow_request", [fresh])).toBe(false);
    await who(null, "anon");
    await expect(db.query("select * from shop_rate_limits")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("voids an unrefunded delivery fee without adding service inventory", async () => {
    const placed = await place(
      orderPayload({
        fulfillment: "delivery",
        address: "Test delivery address, Kuala Lumpur",
        postcode: "50000",
        payment_method: "bank",
        expected_total_sen: 2700,
        items: [{ product_id: product, quantity: 1 }],
      }),
    );
    await rpc("submit_online_payment", [placed.token, "TEST-TRANSFER-2"]);
    await who(owner);
    const id = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [placed.token],
      )
    ).rows[0].id;
    const sale = await manage("confirm_payment", {
      id,
      reference: "VERIFIED-TRANSFER-2",
      verified: true,
      tendered_sen: 2700,
    });
    await rpc("void_sale", [
      {
        sale_id: sale,
        method: "bank",
        reason: "Reverse complete delivery test",
        restock: true,
      },
    ]);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(5);
    expect(
      (
        await db.query<{ n: number }>(
          "select sum(total_sen)::int n from refunds where sale_id=$1",
          [sale],
        )
      ).rows[0].n,
    ).toBe(2700);
  });
});
