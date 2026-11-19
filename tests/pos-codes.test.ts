import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { PromotionDashboard } from "../src/lib/promotions";
import type { PublicOrder } from "../src/lib/shop-types";
import { receiptEnglishName } from "../src/lib/receipt-item-name";
type TestRow = {id:string;percent_bps:number;minimum_spend_sen:number;publication_status:string;ends_at:Date;total_sen:number;subtotal_sen:number;promo_code:string;promotion_discount_sen:number;english_name:string;name:string};
let db: PGlite, product: string;
const owner = "30000000-0000-0000-0000-000000000001",
  cashier = "30000000-0000-0000-0000-000000000002",
  branch = "20000000-0000-0000-0000-000000000001";
async function who(id = owner, role = "authenticated") {
  await db.exec(
    `reset role;select set_config('test.uid','${id}',false);set role ${role}`,
  );
}
async function rpc<T = Record<string, unknown>>(
  name: string,
  args: unknown[] = [],
): Promise<T> {
  return (
    await db.query<{ result: T }>(
      `select ${name}(${args.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
const pay = (extra = {}) => ({
  key: crypto.randomUUID(),
  items: [{ product_id: product, quantity: 1, discount_sen: 0 }],
  discount_kind: "fixed",
  discount_value: 0,
  promo_code: "CGSVIP20",
  payments: [{ method: "cash", amount_sen: 1440, tendered_sen: 1440 }],
  ...extra,
});
const online = (extra = {}) => ({
  key: crypto.randomUUID(),
  name: "Fixture only",
  phone: "0100000000",
  email: "",
  fulfillment: "pickup",
  address: "",
  postcode: "",
  notes: "",
  payment_method: "cash",
  website: "",
  expected_total_sen: 1440,
  items: [{ product_id: product, quantity: 1 }],
  promo_code: "CGSVIP20",
  ...extra,
});
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    readFileSync("tests/database.test.ts", "utf8").match(
      /`(create role anon;[^`]+)`/,
    )![1],
  );
  for (const n of [
    "001_core",
    "002_voids",
    "003_metadata",
    "004_online_store",
    "005_product_english_names",
    "006_delivery_areas",
    "007_payment_proofs",
    "008_nationwide_delivery",
    "009_promotion_management",
    "010_promotion_checkout",
    "011_pos_codes_receipt_names",
  ])
    await db.exec(
      readFileSync(`supabase/migrations/${n}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}'),('${cashier}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Fixture owner','${branch}','owner'),('${cashier}','Fixture cashier','${branch}','cashier');insert into cashier_sessions(branch_id,cashier_id,opening_sen) values('${branch}','${owner}',0),('${branch}','${cashier}',0);update inventory set quantity=100;update online_store_settings set enabled=true,allow_cash_pickup=true,pickup_address='Fixture collection';`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("creates the exact public-by-code 20% campaign with Malaysia year-end expiry", async () => {
  await who(owner, "postgres");
  const p = (
    await db.query<TestRow>("select * from promotions where code='CGSVIP20'")
  ).rows[0];
  expect(p.percent_bps).toBe(2000);
  expect(p.minimum_spend_sen).toBe(0);
  expect(p.publication_status).toBe("published");
  expect(p.ends_at.toISOString()).toBe("2026-12-31T15:59:59.999Z");
  await who();
  const q = await rpc("pos_promotion_quote", [
    { code: "CGSVIP20", items: [{ product_id: product, quantity: 1 }] },
  ]);
  expect(q.discount_sen).toBe(360);
});
it("redeems in cashier POS despite manual discount limit zero and preserves snapshot names/payment", async () => {
  await who(cashier);
  const payload = pay();
  const sid = await rpc<string>("checkout", [payload]);
  expect(await rpc("checkout", [payload])).toBe(sid);
  const sale = (await db.query<TestRow>("select * from sales where id=$1", [sid]))
    .rows[0];
  expect(sale.total_sen).toBe(1440);
  expect(sale.subtotal_sen).toBe(1800);
  expect(sale.promo_code).toBe("CGSVIP20");
  expect(sale.promotion_discount_sen).toBe(360);
  const item = (
    await db.query<TestRow>("select * from sale_items where sale_id=$1", [sid])
  ).rows[0];
  expect(item.english_name).toBe("Original Golden Arrowhead");
  expect(item.name).toBe("原味黄金呀菇");
  await who();
  const dash = await rpc<PromotionDashboard>("promotion_dashboard");
  expect(
    dash.redemptions.some(
      (r) => r.sale_id === sid && r.state === "redeemed",
    ),
  ).toBe(true);
});
it("rejects manipulated prices, manual stacking, extra codes, incorrect payments and public access", async () => {
  await who();
  for (const payload of [
    pay({ discount_value: 1 }),
    pay({ promotion_id: crypto.randomUUID() }),
    pay({ items: [{ product_id: product, quantity: 1, unit_price_sen: 1 }] }),
    pay({ payments: [{ method: "cash", amount_sen: 1, tendered_sen: 1 }] }),
    pay({ promo_code: "DOES-NOT-EXIST" }),
  ])
    await expect(rpc("checkout", [payload])).rejects.toThrow();
  await who(owner, "anon");
  await expect(
    rpc("pos_promotion_quote", [
      { code: "CGSVIP20", items: [{ product_id: product, quantity: 1 }] },
    ]),
  ).rejects.toThrow();
  await expect(rpc("checkout_with_validated_code", [pay()])).rejects.toThrow();
  await expect(rpc("promotion_dashboard")).rejects.toThrow();
});
it("rejects draft, paused, expired and exhausted offers in POS and online, with shared quota", async () => {
  await who(owner, "postgres");
  const original = (
    await db.query<TestRow>("select * from promotions where code='CGSVIP20'")
  ).rows[0];
  for (const state of ["draft", "paused", "ended"]) {
    await db.query(
      "update promotions set publication_status=$1 where code='CGSVIP20'",
      [state],
    );
    await who();
    await expect(rpc("checkout", [pay()])).rejects.toThrow();
    await who(owner, "service_role");
    await expect(
      rpc("place_online_order", [online(), "a".repeat(64)]),
    ).rejects.toThrow();
    await who(owner, "postgres");
  }
  await db.exec(
    "update promotions set publication_status='published',ends_at=clock_timestamp()-interval '1 second' where code='CGSVIP20'",
  );
  await who();
  await expect(rpc("checkout", [pay()])).rejects.toThrow();
  await who(owner, "postgres");
  await db.query(
    "update promotions set ends_at=$1,max_redemptions=1 where code='CGSVIP20'",
    [original.ends_at],
  );
  await who();
  await expect(rpc("checkout", [pay()])).rejects.toThrow(/Limit/);
  await who(owner, "service_role");
  await expect(
    rpc("place_online_order", [online(), "a".repeat(64)]),
  ).rejects.toThrow(/Limit/);
  await who(owner, "postgres");
  await db.exec(
    "update promotions set max_redemptions=null where code='CGSVIP20'",
  );
});
it("preserves online discount, confirmation, names and receipt code while keeping old POS checkout", async () => {
  await who(owner, "service_role");
  const placed = await rpc<{token:string}>("place_online_order", [
    online(),
    "b".repeat(64),
  ]);
  const order = await rpc<PublicOrder>("online_order_status", [placed.token]);
  expect(order.items[0].english_name).toBe("Original Golden Arrowhead");
  expect(order.total_sen).toBe(1440);
  await who();
  const oid = (
    await db.query<TestRow>(
      "select id from online_orders where tracking_token=$1",
      [placed.token],
    )
  ).rows[0].id;
  const sid = await rpc<string>("manage_online_order", [
    "confirm_payment",
    { id: oid, verified: true },
  ]);
  const sale = (await db.query<TestRow>("select * from sales where id=$1", [sid]))
    .rows[0];
  expect(sale.total_sen).toBe(1440);
  expect(sale.promo_code).toBe("CGSVIP20");
  const ordinary = pay({
    promo_code: undefined,
    payments: [{ method: "cash", amount_sen: 1800, tendered_sen: 1800 }],
  });
  expect(await rpc("checkout", [ordinary])).toBeTruthy();
});
it("does not invent names for renamed historical products", () => {
  const products = [{ id: "p", name: "新名字", english_name: "New Name" }];
  expect(
    receiptEnglishName({ product_id: "p", name: "旧名字" }, products),
  ).toBeNull();
  expect(
    receiptEnglishName(
      { product_id: "p", name: "旧名字", english_name: "Saved Name" },
      products,
    ),
  ).toBe("Saved Name");
});
