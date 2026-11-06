import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  malaysiaDateTimeInput,
  malaysiaInputToUtc,
  csvCell,
} from "../src/lib/promotions";
import {
  publicPromotionQuoteSchema,
  offerSchema,
} from "../src/lib/promotion-validation";
let db: PGlite, product: string;
const owner = "30000000-0000-0000-0000-000000000001",
  cashier = "30000000-0000-0000-0000-000000000002";
async function who(id = owner) {
  await db.exec(
    `reset role;select set_config('test.uid','${id}',false);set role authenticated;`,
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
function offer(extra: Record<string, unknown> = {}) {
  return {
    name: "Test offer",
    code: "TEST-" + crypto.randomUUID().slice(0, 8),
    discount_type: "percent",
    percent_bps: 2000,
    fixed_discount_sen: 0,
    starts_at: new Date(Date.now() - 86400000).toISOString(),
    ends_at: new Date(Date.now() + 86400000).toISOString(),
    minimum_spend_sen: 0,
    discount_cap_sen: null,
    max_redemptions: null,
    eligible_product_ids: [],
    eligible_category_ids: [],
    excluded_product_ids: [],
    excluded_category_ids: [],
    allow_manual_stacking: false,
    publish: true,
    ...extra,
  };
}
async function row(id: string) {
  return (
    await db.query<Record<string, unknown>>(
      "select * from promotions where id=$1",
      [id],
    )
  ).rows[0];
}
async function save(extra: Record<string, unknown> = {}) {
  const value = offer(extra);
  const id = await rpc("manage_promotion", ["save", value]);
  return { id, value };
}
async function simulate(code: string, extra = {}) {
  return rpc<Record<string, unknown>>("promotion_simulate", [
    { code, items: [{ product_id: product, quantity: 1 }], ...extra },
  ]);
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
    "006_delivery_areas",
    "007_payment_proofs",
    "008_promotion_management",
  ])
    await db.exec(
      readFileSync(`supabase/migrations/${name}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}'),('${cashier}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Owner','20000000-0000-0000-0000-000000000001','owner'),('${cashier}','Cashier','20000000-0000-0000-0000-000000000001','cashier');`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
  await who();
}, 30000);
afterAll(async () => {
  await db.close();
});
it("converts Malaysia dates exactly and prevents spreadsheet formulas", () => {
  expect(malaysiaInputToUtc("2026-11-30T23:59:59")).toBe(
    "2026-11-30T15:59:59.000Z",
  );
  expect(malaysiaDateTimeInput("2026-11-05T16:00:00Z")).toBe(
    "2026-11-06T00:00:00",
  );
  expect(() => malaysiaInputToUtc("2026-02-30T00:00:00")).toThrow();
  expect(csvCell('=HYPERLINK("x")')).toContain("'");
});
it("rejects customer supplied prices/time and invalid settings", () => {
  const q = {
    code: " cgsvip20 ",
    items: [{ product_id: crypto.randomUUID(), quantity: 1 }],
  };
  expect(publicPromotionQuoteSchema.parse(q).code).toBe("CGSVIP20");
  for (const extra of [
    { at: "2026-11-20T00:00:00Z" },
    { discount_sen: 1 },
    { customer_id: owner },
  ])
    expect(
      publicPromotionQuoteSchema.safeParse({ ...q, ...extra }).success,
    ).toBe(false);
  expect(offerSchema.safeParse(offer({ discount_cap_sen: 0 })).success).toBe(
    false,
  );
});
it("seeds CGSVIP20 once, as draft, with exact Malaysia validity and no restrictions", async () => {
  const id = await rpc("promotion_seed_cgsvip20");
  const p = await row(id);
  expect(p.publication_status).toBe("draft");
  expect(p.percent_bps).toBe(2000);
  expect(p.active).toBe(false);
  expect(await rpc("promotion_seed_cgsvip20")).toBe(id);
  expect((await row(id)).version).toBe(p.version);
  expect(
    (
      await simulate("cgsvip20", {
        at: "2026-11-06T00:00:00+08:00",
        preview_draft: true,
      })
    ).discount_sen,
  ).toBe(360);
  await expect(
    simulate("CGSVIP20", {
      at: "2026-12-01T00:00:00+08:00",
      preview_draft: true,
    }),
  ).rejects.toThrow(/Draft/);
});
it("uses server prices, case insensitive codes, caps and fixed discounts", async () => {
  const { value } = await save();
  expect((await simulate(value.code.toLowerCase())).discount_sen).toBe(360);
  const capped = await save({ discount_cap_sen: 100 });
  expect((await simulate(capped.value.code)).discount_sen).toBe(100);
  const fixed = await save({
    discount_type: "fixed",
    fixed_discount_sen: 5000,
  });
  expect((await simulate(fixed.value.code)).discount_sen).toBe(1800);
  await expect(save({ code: value.code.toLowerCase() })).rejects.toThrow(
    /unique/,
  );
});
it("enforces minimum, exclusions and stacking, including exact minimum boundary", async () => {
  const exact = await save({ minimum_spend_sen: 1800 });
  expect((await simulate(exact.value.code)).discount_sen).toBe(360);
  const min = await save({ minimum_spend_sen: 1801 });
  await expect(simulate(min.value.code)).rejects.toThrow(/Minimum/);
  const excluded = await save({ excluded_product_ids: [product] });
  await expect(simulate(excluded.value.code)).rejects.toThrow(/eligible/);
  await expect(
    simulate(exact.value.code, { manual_discount_sen: 100 }),
  ).rejects.toThrow(/stacked/);
  const stacking = await save({ allow_manual_stacking: true });
  expect(
    (await simulate(stacking.value.code, { manual_discount_sen: 100 }))
      .discount_sen,
  ).toBe(340);
});
it("supports pause/resume/end, version checks and immutable revisions", async () => {
  const { id, value } = await save();
  await rpc("manage_promotion", ["pause", { id, expected_version: 1 }]);
  await expect(simulate(value.code)).rejects.toThrow(/Paused/);
  await expect(
    rpc("manage_promotion", ["resume", { id, expected_version: 1 }]),
  ).rejects.toThrow(/changed/);
  await rpc("manage_promotion", ["resume", { id, expected_version: 2 }]);
  expect((await simulate(value.code)).discount_sen).toBe(360);
  await rpc("manage_promotion", ["end", { id, expected_version: 3 }]);
  await expect(simulate(value.code)).rejects.toThrow(/Expired/);
  expect(
    (
      await db.query(
        "select * from promotion_revisions where promotion_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(4);
});
it("duplicates into an unused draft and only permits draft deletion", async () => {
  const { id } = await save();
  const duplicate = await rpc("manage_promotion", [
    "duplicate",
    { id, expected_version: 1 },
  ]);
  expect((await row(duplicate)).publication_status).toBe("draft");
  await rpc("manage_promotion", [
    "delete_draft",
    { id: duplicate, expected_version: 1 },
  ]);
  await expect(
    rpc("manage_promotion", ["delete_draft", { id, expected_version: 1 }]),
  ).rejects.toThrow(/unused draft/);
});
it("denies cashier administration and all direct guest access", async () => {
  await who(cashier);
  await expect(rpc("promotion_dashboard")).rejects.toThrow();
  expect(
    (await db.query("select * from promotions where code is not null")).rows,
  ).toHaveLength(0);
  await db.exec("reset role;set role anon");
  await expect(rpc("promotion_dashboard")).rejects.toThrow(/permission/);
  await expect(
    rpc("shop_promotion_quote", [
      "CGSVIP20",
      [{ product_id: product, quantity: 1 }],
    ]),
  ).rejects.toThrow(/permission/);
  await who();
  const dashboard = await rpc<{ offers: unknown[]; redemptions: unknown[] }>(
    "promotion_dashboard",
  );
  expect(dashboard.offers.length).toBeGreaterThan(1);
  expect(dashboard.redemptions).toEqual([]);
});

async function orderFixture(total = 1440) {
  await db.exec("reset role");
  const id = crypto.randomUUID();
  await db.query(
    `insert into online_orders(id,idempotency_key,request_hash,order_number,branch_id,customer_name,phone,fulfillment,payment_method,instructions,subtotal_sen,delivery_fee_sen,tax_bps,tax_sen,total_sen) values($1,$2,'test',$3,'20000000-0000-0000-0000-000000000001','Fixture','0100000000','pickup','cash','{}',1800,0,0,0,$4)`,
    [id, crypto.randomUUID(), "TEST-" + id, total],
  );
  await db.query(
    `insert into online_order_items(order_id,product_id,sku,name,quantity,unit_price_sen,total_sen) values($1,$2,'LF-02','Fixture',1,1800,1800)`,
    [id, product],
  );
  return id;
}
it("reserves once, enforces quota, releases cancellations, preserves historical discount", async () => {
  await who();
  const { id, value } = await save({ max_redemptions: 1 });
  const order = await orderFixture();
  const redemption = await rpc("reserve_promotion_for_order", [
    value.code,
    order,
  ]);
  expect(await rpc("reserve_promotion_for_order", [value.code, order])).toBe(
    redemption,
  );
  await who();
  await expect(simulate(value.code)).rejects.toThrow(/Limit Reached/);
  await db.exec("reset role");
  await db.query("update online_orders set status='cancelled' where id=$1", [
    order,
  ]);
  await who();
  expect((await simulate(value.code)).discount_sen).toBe(360);
  const second = await orderFixture();
  await rpc("reserve_promotion_for_order", [value.code, second]);
  await db.query(
    "update promotion_redemptions set expires_at=now()-interval '1 second' where order_id=$1",
    [second],
  );
  await who();
  expect((await simulate(value.code)).discount_sen).toBe(360);
  await rpc("manage_promotion", [
    "save",
    { ...value, id, expected_version: 1, percent_bps: 5000 },
  ]);
  const historical = (
    await db.query<{ discount_sen: number; promotion_version: number }>(
      "select discount_sen,promotion_version from promotion_redemptions where id=$1",
      [redemption],
    )
  ).rows[0];
  expect(historical.discount_sen).toBe(360);
  expect(historical.promotion_version).toBe(1);
  const full = await orderFixture(1800);
  await expect(
    rpc("reserve_promotion_for_order", [value.code, full]),
  ).rejects.toThrow(/validated promotion/);
  await who();
});
it("reports paid sales and refunds without rewriting past redemptions", async () => {
  const { id, value } = await save();
  const order = await orderFixture();
  await rpc("reserve_promotion_for_order", [value.code, order]);
  const session = crypto.randomUUID(),
    sale = crypto.randomUUID();
  await db.query(
    "insert into cashier_sessions(id,branch_id,cashier_id,opening_sen) values($1,'20000000-0000-0000-0000-000000000001',$2,0)",
    [session, owner],
  );
  await db.query(
    "insert into sales(id,idempotency_key,receipt_number,cashier_name,branch_id,cashier_id,session_id,subtotal_sen,discount_sen,total_sen) values($1,$2,$3,'Fixture','20000000-0000-0000-0000-000000000001',$4,$5,1800,360,1440)",
    [sale, crypto.randomUUID(), "TEST-" + sale, owner, session],
  );
  await db.query(
    "update online_orders set sale_id=$1,status='paid' where id=$2",
    [sale, order],
  );
  await db.query(
    "insert into refunds(sale_id,staff_id,reason,total_sen,method,idempotency_key) values($1,$2,'Fixture refund',400,'cash',$3)",
    [sale, owner, crypto.randomUUID()],
  );
  await who();
  const dash = await rpc<{
    offers: {
      id: string;
      redemptions: number;
      total_discount_sen: number;
      associated_sales_sen: number;
      net_sales_sen: number;
    }[];
  }>("promotion_dashboard");
  const stats = dash.offers.find((p) => p.id === id)!;
  expect(stats.redemptions).toBe(1);
  expect(stats.total_discount_sen).toBe(360);
  expect(stats.associated_sales_sen).toBe(1440);
  expect(stats.net_sales_sen).toBe(1040);
});
it("shows scheduled and inclusive expiry boundaries using authoritative dates", async () => {
  const { value } = await save({
    starts_at: "2090-01-01T00:00:00+08:00",
    ends_at: "2090-01-31T23:59:59+08:00",
  });
  await expect(
    simulate(value.code, { at: "2089-12-31T23:59:59+08:00" }),
  ).rejects.toThrow(/Scheduled/);
  expect(
    (await simulate(value.code, { at: "2090-01-31T23:59:59+08:00" }))
      .discount_sen,
  ).toBe(360);
  await expect(
    simulate(value.code, { at: "2090-02-01T00:00:00+08:00" }),
  ).rejects.toThrow(/Expired/);
});
it("does not allow a different branch owner to inspect, edit or simulate offers", async () => {
  await who();
  const { id, value } = await save();
  await db.exec("reset role");
  const branch = crypto.randomUUID(),
    other = crypto.randomUUID();
  await db.query(
    "insert into branches(id,business_id,name) values($1,'10000000-0000-0000-0000-000000000001','Other fixture')",
    [branch],
  );
  await db.query("insert into auth.users values($1)", [other]);
  await db.query(
    "insert into profiles(id,display_name,branch_id,role) values($1,'Other owner',$2,'owner')",
    [other, branch],
  );
  await who(other);
  expect(
    (await db.query("select * from promotions where code is not null")).rows,
  ).toEqual([]);
  await expect(simulate(value.code)).rejects.toThrow(/Invalid/);
  await expect(
    rpc("manage_promotion", ["pause", { id, expected_version: 1 }]),
  ).rejects.toThrow();
  await who();
});
it("keeps codes disabled for legacy POS even if legacy toggle is called", async () => {
  const { id } = await save();
  await rpc("retail_action", ["promotion_toggle", { id, active: true }]);
  expect((await row(id)).active).toBe(false);
});
it("quotes guests only with service privileges and current server time", async () => {
  const { value } = await save();
  await db.exec("reset role;set role service_role");
  expect(
    (
      await rpc<{ discount_sen: number }>("shop_promotion_quote", [
        value.code.toLowerCase(),
        [{ product_id: product, quantity: 1 }],
      ])
    ).discount_sen,
  ).toBe(360);
  await expect(
    rpc("reserve_promotion_for_order", [value.code, crypto.randomUUID()]),
  ).rejects.toThrow(/permission/);
  await who();
  const future = await save({
    starts_at: "2090-01-01T00:00:00Z",
    ends_at: "2090-02-01T00:00:00Z",
  });
  await db.exec("reset role;set role service_role");
  await expect(
    rpc("shop_promotion_quote", [
      future.value.code,
      [{ product_id: product, quantity: 1 }],
    ]),
  ).rejects.toThrow(/Scheduled/);
  await who();
});
it("applies product/category inclusion and lets category exclusions win", async () => {
  await who();
  const category = (
    await db.query<{ category_id: string }>(
      "select category_id from products where id=$1",
      [product],
    )
  ).rows[0].category_id;
  const other = (
    await db.query<{ id: string }>(
      "select id from products where id<>$1 limit 1",
      [product],
    )
  ).rows[0].id;
  const included = await save({ eligible_category_ids: [category] });
  expect((await simulate(included.value.code)).discount_sen).toBe(360);
  const outside = await save({ eligible_product_ids: [other] });
  await expect(simulate(outside.value.code)).rejects.toThrow(/eligible/);
  const blocked = await save({
    eligible_product_ids: [product],
    excluded_category_ids: [category],
  });
  await expect(simulate(blocked.value.code)).rejects.toThrow(/eligible/);
});
it("reconciles changed CGSVIP20 settings without losing its existing revisions", async () => {
  const id = await rpc("promotion_seed_cgsvip20");
  const p = await row(id);
  await rpc("manage_promotion", [
    "save",
    {
      ...offer(),
      id,
      expected_version: p.version,
      code: "CGSVIP20",
      percent_bps: 1000,
      publish: false,
    },
  ]);
  expect((await row(id)).percent_bps).toBe(1000);
  expect(await rpc("promotion_seed_cgsvip20")).toBe(id);
  const restored = await row(id);
  expect(restored.percent_bps).toBe(2000);
  expect(restored.version).toBe(Number(p.version) + 2);
  expect(await rpc("promotion_seed_cgsvip20")).toBe(id);
  expect((await row(id)).version).toBe(restored.version);
});
