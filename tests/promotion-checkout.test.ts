import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
let db: PGlite, product: string;
const owner = "30000000-0000-0000-0000-000000000001",
  bucket = "c".repeat(64);
async function who(role = "service_role") {
  await db.exec(
    `reset role;select set_config('test.uid','${role === "authenticated" ? owner : ""}',false);set role ${role}`,
  );
}
async function rpc<T = string>(name: string, args: unknown[] = []): Promise<T> {
  return (
    await db.query<{ result: T }>(
      `select ${name}(${args.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
const payload = (extra: Record<string, unknown> = {}) => ({
  key: crypto.randomUUID(),
  name: "Promotion test",
  phone: "0100000000",
  email: "",
  fulfillment: "pickup",
  address: "",
  postcode: "",
  notes: "Test fixture only",
  payment_method: "cash",
  website: "",
  items: [{ product_id: product, quantity: 2 }],
  promo_code: "cgsvip20",
  expected_total_sen: 16000,
  ...extra,
});
async function place(extra = {}) {
  await who();
  return rpc<{ token: string; order_number: string }>("place_online_order", [
    payload(extra),
    bucket,
  ]);
}
async function order(token: string) {
  await db.exec("reset role");
  return (
    await db.query<Record<string, unknown>>(
      "select * from online_orders where tracking_token=$1",
      [token],
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    readFileSync("tests/database.test.ts", "utf8").match(
      /`(create role anon;[^`]+)`/,
    )![1],
  );
  for (const name of [
    "001_core",
    "002_voids",
    "003_metadata",
    "004_online_store",
    "005_product_english_names",
    "006_delivery_areas",
    "007_payment_proofs",
    "008_promotion_management",
    "009_promotion_checkout",
  ])
    await db.exec(
      readFileSync(`supabase/migrations/${name}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Owner','20000000-0000-0000-0000-000000000001','owner');update promotions set publication_status='published' where code='CGSVIP20';update inventory set quantity=1000;update system_settings set tax_bps=0;update products set price_sen=10000,english_name='Original Golden Arrowhead' where sku='LF-02';update online_store_settings set enabled=true,allow_pickup=true,allow_delivery=true,allow_cash_pickup=true,pickup_address='Test pickup address',bank_name='Test bank',bank_account_name='Test store',bank_account_number='TEST-ONLY',delivery_fee_sen=2000,delivery_areas='[{"id":"60000000-0000-0000-0000-000000000001","name":"Test Klang Valley","postcodes":["48000"],"standard_fee_sen":1500,"free_delivery_eligible":true}]';`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
}, 30000);
afterAll(async () => {
  await db.close();
});
it("quotes 20% from authoritative prices and rejects an invalid or paused code", async () => {
  await who();
  const quote = await rpc<Record<string, unknown>>("quote_online_order", [
    payload(),
  ]);
  expect(quote.promotion_discount_sen).toBe(4000);
  expect(quote.total_sen).toBe(16000);
  await expect(
    rpc("quote_online_order", [payload({ promo_code: "INVALID" })]),
  ).rejects.toThrow(/Invalid/);
  await db.exec(
    "reset role;update promotions set publication_status='paused' where code='CGSVIP20'",
  );
  await who();
  await expect(rpc("quote_online_order", [payload()])).rejects.toThrow(
    /Paused/,
  );
  await db.exec(
    "reset role;update promotions set publication_status='published' where code='CGSVIP20'",
  );
});
it("uses the after-discount shipping threshold and only configured eligible postcodes", async () => {
  for (const [price, postcode, total, fee] of [
    [35000, "48000", 29500, 1500],
    [40000, "48000", 32000, 0],
    [40000, "43000", 34000, 2000],
  ] as const) {
    await db.exec("reset role");
    await db.query("update products set price_sen=$1 where id=$2", [
      price,
      product,
    ]);
    await who();
    const q = await rpc<Record<string, unknown>>("quote_online_order", [
      payload({
        items: [{ product_id: product, quantity: 1 }],
        fulfillment: "delivery",
        address: "Test address Kuala Lumpur",
        postcode,
        payment_method: "bank",
      }),
    ]);
    expect(q.total_sen).toBe(total);
    expect(q.fee_sen).toBe(fee);
    const placed = await place({
      items: [{ product_id: product, quantity: 1 }],
      fulfillment: "delivery",
      address: "Test address Kuala Lumpur",
      postcode,
      payment_method: "bank",
      expected_total_sen: total,
    });
    expect((await order(placed.token)).delivery_fee_sen).toBe(fee);
  }
  await db.exec("reset role");
  await db.query("update products set price_sen=10000 where id=$1", [product]);
});
it("places an idempotent discounted order and preserves its frozen bilingual receipt", async () => {
  const data = payload();
  await who();
  const first = await rpc<{ token: string }>("place_online_order", [
    data,
    bucket,
  ]);
  expect(
    (await rpc<{ token: string }>("place_online_order", [data, bucket])).token,
  ).toBe(first.token);
  const o = await order(first.token);
  expect(o.promotion_discount_sen).toBe(4000);
  expect(o.total_sen).toBe(16000);
  expect(
    (
      await db.query("select * from promotion_redemptions where order_id=$1", [
        o.id,
      ])
    ).rows,
  ).toHaveLength(1);
  await db.exec(
    "update products set english_name='Changed future name' where sku='LF-02';update promotions set percent_bps=1000 where code='CGSVIP20'",
  );
  await who();
  const receipt = await rpc<{
    items: { english_name: string }[];
    promotion_discount_sen: number;
  }>("online_order_status", [first.token]);
  expect(receipt.items[0].english_name).toBe("Original Golden Arrowhead");
  expect(receipt.promotion_discount_sen).toBe(4000);
  await db.exec(
    "reset role;update promotions set percent_bps=2000 where code='CGSVIP20'",
  );
});
it("rejects stale payable totals and client-supplied discounts without creating an order", async () => {
  await expect(place({ expected_total_sen: 1 })).rejects.toThrow(/Prices/);
  await expect(place({ discount_sen: 1 })).rejects.toThrow(/Client-supplied/);
});
it("records the actual discount into sales and refunds only the net item value", async () => {
  const placed = await place();
  const o = await order(placed.token);
  await who("authenticated");
  await rpc("retail_action", ["open_session", { opening_sen: 0 }]);
  const sale = await rpc("manage_online_order", [
    "confirm_payment",
    { id: o.id, verified: true, tendered_sen: 16000 },
  ]);
  const s = (
    await db.query<{ discount_sen: number; total_sen: number }>(
      "select * from sales where id=$1",
      [sale],
    )
  ).rows[0];
  expect(s.discount_sen).toBe(4000);
  expect(s.total_sen).toBe(16000);
  const item = (
    await db.query<{ id: string; discount_sen: number; total_sen: number }>(
      "select * from sale_items where sale_id=$1",
      [sale],
    )
  ).rows[0];
  expect(item.discount_sen).toBe(4000);
  expect(item.total_sen).toBe(16000);
  expect(
    await rpc("manage_online_order", [
      "confirm_payment",
      { id: o.id, verified: true },
    ]),
  ).toBe(sale);
  const refund = await rpc("retail_action", [
    "refund",
    {
      key: crypto.randomUUID(),
      sale_id: sale,
      sale_item_id: item.id,
      quantity: 1,
      reason: "Test refund",
      method: "cash",
      restock: true,
    },
  ]);
  expect(
    (
      await db.query<{ total_sen: number }>(
        "select total_sen from refunds where id=$1",
        [refund],
      )
    ).rows[0].total_sen,
  ).toBe(8000);
  expect(
    (
      await db.query<{ state: string }>(
        "select state from promotion_redemptions where order_id=$1",
        [o.id],
      )
    ).rows[0].state,
  ).toBe("redeemed");
});
it("binds QR proof to the discounted payable amount and still requires manual verification", async () => {
  await who();
  const staged = await rpc<{ id: string; token: string }>(
    "prepare_payment_proof",
    [
      {
        key: crypto.randomUUID(),
        filename: "test.png",
        mime_type: "image/png",
        byte_size: 68,
        sha256: "a".repeat(64),
        total_sen: 16000,
      },
      bucket,
    ],
  );
  await rpc("complete_payment_proof", [staged.id, staged.token, true]);
  const placed = await place({
    payment_method: "duitnow",
    proof_id: staged.id,
    proof_token: staged.token,
  });
  const o = await order(placed.token);
  expect(o.total_sen).toBe(16000);
  expect(o.status).toBe("payment_submitted");
  expect(o.sale_id).toBe(null);
  expect(o.payment_proof_received).toBe(true);
  await who("authenticated");
  await expect(
    rpc("manage_online_order", [
      "confirm_payment",
      { id: o.id, verified: false, reference: "TEST-VERIFIED" },
    ]),
  ).rejects.toThrow(/verified/);
});
it("rejects expired reservations at payment confirmation and does not change the quoted discount", async () => {
  const placed = await place();
  const o = await order(placed.token);
  await db.query(
    "update online_orders set expires_at=now()-interval '1 second' where id=$1",
    [o.id],
  );
  await who("authenticated");
  await expect(
    rpc("manage_online_order", [
      "confirm_payment",
      { id: o.id, verified: true },
    ]),
  ).rejects.toThrow(/expired/);
});
