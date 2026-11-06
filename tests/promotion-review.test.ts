import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
let db: PGlite,
  product: string,
  legacyPromotion: string,
  legacyOrder: { token: string };
let before: Record<string, Record<string, unknown>[]>;
const owner = "30000000-0000-0000-0000-000000000001",
  branch = "20000000-0000-0000-0000-000000000001",
  business = "10000000-0000-0000-0000-000000000001",
  bucket = "d".repeat(64);
const manifest = JSON.parse(
  readFileSync("supabase/review/baseline-001-007.json", "utf8"),
);
async function who(id = owner, role = "authenticated") {
  await db.exec(
    `reset role;select set_config('test.uid','${role === "authenticated" ? id : ""}',false);set role ${role}`,
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
  name: "Isolated review customer",
  phone: "0100000000",
  email: "",
  fulfillment: "pickup",
  address: "",
  postcode: "",
  notes: "Review fixture only",
  payment_method: "cash",
  website: "",
  expected_total_sen: 1440,
  items: [{ product_id: product, quantity: 1 }],
  promo_code: "CGSVIP20",
  ...extra,
});
const offer = (extra: Record<string, unknown> = {}) => ({
  name: "Review offer",
  code: "REVIEW-" + crypto.randomUUID().slice(0, 8),
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
});
async function snapshot() {
  const result: typeof before = {};
  for (const table of [
    ...new Set<string>(
      manifest.columns.map((c: { table_name: string }) => c.table_name),
    ),
  ])
    result[table] = (
      await db.query<Record<string, unknown>>(`select * from public.${table}`)
    ).rows;
  return result;
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
  ])
    await db.exec(
      readFileSync(`supabase/migrations/${name}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Review owner','${branch}','owner');update inventory set quantity=100;update online_store_settings set enabled=true,allow_cash_pickup=true,pickup_address='Isolated review pickup';`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
  await who();
  await rpc("retail_action", ["open_session", { opening_sen: 0 }]);
  legacyPromotion = await rpc("retail_action", [
    "promotion",
    {
      name: "Existing POS offer",
      percent_bps: 1000,
      starts_at: "2020-01-01T00:00:00Z",
      ends_at: "2090-01-01T00:00:00Z",
    },
  ]);
  await rpc("checkout", [
    {
      key: crypto.randomUUID(),
      items: [{ product_id: product, quantity: 2, discount_sen: 0 }],
      discount_kind: "fixed",
      discount_value: 0,
      promotion_id: legacyPromotion,
      payments: [{ method: "cash", amount_sen: 3240, tendered_sen: 3240 }],
    },
  ]);
  await who("", "service_role");
  const legacyPayload = payload({ expected_total_sen: 1800 });
  delete (legacyPayload as Record<string, unknown>).promo_code;
  legacyOrder = await rpc("place_online_order", [legacyPayload, bucket]);
  await db.exec("reset role");
  before = await snapshot();
  // Simulate Supabase default grants; new private functions must revoke these.
  await db.exec(
    "alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;",
  );
  await db.exec(readFileSync("supabase/review/schema-preflight.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/review/promotion-release-reviewed.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
it("preserves every pre-existing POS, order, receipt, stock and legacy promotion field", async () => {
  const after = await snapshot();
  for (const [table, rows] of Object.entries(before)) {
    expect(after[table].length, table).toBe(
      rows.length + (table === "promotions" ? 1 : 0),
    );
    for (const row of rows) {
      const keys =
        "id" in row
          ? ["id"]
          : "bucket" in row
            ? ["bucket"]
            : "branch_id" in row && "product_id" in row
              ? ["branch_id", "product_id"]
              : "branch_id" in row
                ? ["branch_id"]
                : "product_id" in row
                  ? ["product_id"]
                  : "sale_item_id" in row
                    ? ["sale_item_id"]
                    : ["name"];
      const found = after[table].find((item) =>
        keys.every((key) => item[key] === row[key]),
      );
      expect(found, table).toBeDefined();
      for (const [key, value] of Object.entries(row))
        expect(found?.[key], `${table}.${key}`).toEqual(value);
    }
  }
});
it("leaves CGSVIP20 draft; only explicit publication enables a customer quote", async () => {
  await who("", "service_role");
  await expect(
    rpc("shop_promotion_quote", ["CGSVIP20", payload().items]),
  ).rejects.toThrow(/Draft/);
  await who();
  const p = (
    await db.query<{ id: string; version: number; ends_at: Date }>(
      "select * from promotions where code='CGSVIP20'",
    )
  ).rows[0];
  await rpc("manage_promotion", [
    "publish",
    { id: p.id, expected_version: p.version },
  ]);
  await who("", "service_role");
  expect(
    (
      await rpc<{ discount_sen: number }>("shop_promotion_quote", [
        "cgsvip20",
        payload().items,
      ])
    ).discount_sen,
  ).toBe(360);
});
it("includes the complete final Malaysia second and rejects the next midnight", async () => {
  await who();
  for (const at of [
    "2026-11-30T23:59:59+08:00",
    "2026-11-30T23:59:59.999999+08:00",
  ])
    expect(
      (
        await rpc<{ discount_sen: number }>("promotion_simulate", [
          { code: "CGSVIP20", items: payload().items, at },
        ])
      ).discount_sen,
    ).toBe(360);
  await expect(
    rpc("promotion_simulate", [
      {
        code: "CGSVIP20",
        items: payload().items,
        at: "2026-12-01T00:00:00+08:00",
      },
    ]),
  ).rejects.toThrow(/Expired/);
});
it("rejects paused, draft, scheduled and exhausted codes at placement", async () => {
  for (const [extra, message] of [
    [{ publish: false }, /Draft/],
    [
      { starts_at: "2090-01-01T00:00:00Z", ends_at: "2090-02-01T00:00:00Z" },
      /Scheduled/,
    ],
  ] as const) {
    await who();
    const value = offer(extra);
    await rpc("manage_promotion", ["save", value]);
    await who("", "service_role");
    await expect(
      rpc("place_online_order", [payload({ promo_code: value.code }), bucket]),
    ).rejects.toThrow(message);
  }
  await who();
  const value = offer({ max_redemptions: 1 });
  const id = await rpc("manage_promotion", ["save", value]);
  await rpc("manage_promotion", ["pause", { id, expected_version: 1 }]);
  await who("", "service_role");
  await expect(
    rpc("place_online_order", [payload({ promo_code: value.code }), bucket]),
  ).rejects.toThrow(/Paused/);
  await who();
  await rpc("manage_promotion", ["resume", { id, expected_version: 2 }]);
  await who("", "service_role");
  await rpc("place_online_order", [
    payload({ promo_code: value.code }),
    bucket,
  ]);
  await expect(
    rpc("place_online_order", [payload({ promo_code: value.code }), bucket]),
  ).rejects.toThrow(/Limit Reached/);
});
it("rejects financial overrides, category spoofing, null/fractional quantities and duplicate UUID spelling", async () => {
  await who("", "service_role");
  for (const extra of [
    { discount_sen: 1 },
    { unit_price_sen: 1 },
    { tax_sen: 0 },
    { branch_id: branch },
    { verified: true },
    { status: "paid" },
    { promotion_snapshot: { percent_bps: 10000 } },
    { at: "2026-11-06T00:00:00Z" },
    { preview_draft: true },
    { items: [{ product_id: product, quantity: 1, price_sen: 1 }] },
    {
      items: [
        { product_id: product, quantity: 1, category_id: crypto.randomUUID() },
      ],
    },
    { items: [{ product_id: product, quantity: null }] },
    { items: [{ product_id: product, quantity: 1.5 }] },
    { items: [{ product_id: product, quantity: "1" }] },
    {
      items: [
        { product_id: product, quantity: 1 },
        { product_id: product.toUpperCase(), quantity: 1 },
      ],
    },
  ])
    await expect(
      rpc("place_online_order", [payload(extra), bucket]),
    ).rejects.toThrow();
  expect(
    (
      await rpc<{ discount_sen: number }>("shop_promotion_quote", [
        "CGSVIP20",
        payload().items,
      ])
    ).discount_sen,
  ).toBe(360);
});
it("retains discounted tax and cumulative sen rounding through partial/full refunds", async () => {
  await db.exec("reset role");
  await db.query("update products set price_sen=101 where id=$1", [product]);
  await db.exec("update system_settings set tax_bps=600");
  await who("", "service_role");
  const placed = await rpc<{ token: string }>("place_online_order", [
    payload({
      items: [{ product_id: product, quantity: 3 }],
      expected_total_sen: 257,
    }),
    bucket,
  ]);
  await db.exec("reset role");
  const o = (
    await db.query<{
      id: string;
      promotion_discount_sen: number;
      tax_sen: number;
    }>("select * from online_orders where tracking_token=$1", [placed.token])
  ).rows[0];
  expect(o.promotion_discount_sen).toBe(61);
  expect(o.tax_sen).toBe(15);
  await who();
  const sale = await rpc("manage_online_order", [
    "confirm_payment",
    { id: o.id, verified: true, tendered_sen: 257 },
  ]);
  const item = (
    await db.query<{ id: string; total_sen: number; discount_sen: number }>(
      "select * from sale_items where sale_id=$1",
      [sale],
    )
  ).rows[0];
  expect(item.discount_sen).toBe(61);
  expect(item.total_sen).toBe(242);
  for (let i = 0; i < 3; i++)
    await rpc("retail_action", [
      "refund",
      {
        key: crypto.randomUUID(),
        sale_id: sale,
        sale_item_id: item.id,
        quantity: 1,
        reason: "Isolated review refund",
        method: "cash",
        restock: true,
      },
    ]);
  expect(
    (
      await db.query<{ n: number }>(
        "select sum(total_sen)::int n from refunds where sale_id=$1",
        [sale],
      )
    ).rows[0].n,
  ).toBe(257);
  await db.exec("reset role;update system_settings set tax_bps=0");
  await db.query("update products set price_sen=1800 where id=$1", [product]);
});
it("can confirm a pre-migration order with no promotion ledger", async () => {
  await db.exec("reset role");
  const o = (
    await db.query<{ id: string }>(
      "select id from online_orders where tracking_token=$1",
      [legacyOrder.token],
    )
  ).rows[0];
  await who();
  const sale = await rpc("manage_online_order", [
    "confirm_payment",
    { id: o.id, verified: true, tendered_sen: 1800 },
  ]);
  expect(
    (
      await db.query<{ discount_sen: number }>(
        "select discount_sen from sales where id=$1",
        [sale],
      )
    ).rows[0].discount_sen,
  ).toBe(0);
});
it("keeps private helpers denied even under Supabase-style permissive default grants", async () => {
  await db.exec("reset role");
  for (const signature of [
    "require_promotion_owner()",
    "validate_promotion_items(jsonb)",
    "validate_online_pricing_payload(jsonb)",
    "validate_promotion_redemption()",
    "evaluate_promotion(uuid,jsonb,timestamptz,boolean,bigint)",
    "reserve_promotion_for_order(text,uuid)",
    "manage_online_order_before_delivery(text,jsonb)",
    "retail_action_before_promotions(text,jsonb)",
  ])
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,$2,'execute') allowed",
            [role, signature],
          )
        ).rows[0].allowed,
        `${role}: ${signature}`,
      ).toBe(false);
  for (const table of ["promotion_redemptions", "promotion_revisions"])
    for (const role of ["anon", "authenticated"])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_table_privilege($1,$2,'insert,update,delete') allowed",
            [role, table],
          )
        ).rows[0].allowed,
      ).toBe(false);
  await who("", "anon");
  await expect(
    rpc("shop_promotion_quote", ["CGSVIP20", payload().items]),
  ).rejects.toThrow(/permission/);
  await expect(rpc("promotion_dashboard")).rejects.toThrow(/permission/);
});
it("blocks unrelated-business management and cross-branch usage/audit disclosure", async () => {
  await db.exec("reset role");
  const otherBusiness = crypto.randomUUID(),
    otherBranch = crypto.randomUUID(),
    otherOwner = crypto.randomUUID(),
    sameBusinessBranch = crypto.randomUUID(),
    branchOwner = crypto.randomUUID();
  await db.query(
    "insert into businesses(id,name,ssm) values($1,'Unrelated test business','TEST')",
    [otherBusiness],
  );
  await db.query(
    "insert into branches(id,business_id,name) values($1,$2,'Unrelated'),($3,$4,'Other CHIPSTI branch')",
    [otherBranch, otherBusiness, sameBusinessBranch, business],
  );
  await db.query("insert into auth.users values($1),($2)", [
    otherOwner,
    branchOwner,
  ]);
  await db.query(
    "insert into profiles(id,display_name,branch_id,role) values($1,'Unrelated owner',$2,'owner'),($3,'Branch owner',$4,'owner')",
    [otherOwner, otherBranch, branchOwner, sameBusinessBranch],
  );
  await who(otherOwner);
  await expect(rpc("promotion_dashboard")).rejects.toThrow(/restricted/);
  await expect(rpc("manage_promotion", ["save", offer()])).rejects.toThrow(
    /restricted/,
  );
  await who(branchOwner);
  const value = offer();
  await rpc("manage_promotion", ["save", value]);
  expect(
    (await db.query("select * from promotions where code='CGSVIP20'")).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select * from audit_logs where action like 'promotion:%' and details->>'branch_id'<>$1",
        [sameBusinessBranch],
      )
    ).rows,
  ).toHaveLength(0);
  await who("", "service_role");
  await expect(
    rpc("shop_promotion_quote", [value.code, payload().items]),
  ).rejects.toThrow(/Invalid/);
  await who();
  await expect(
    rpc("promotion_simulate", [{ code: value.code, items: payload().items }]),
  ).rejects.toThrow(/Invalid/);
});
it("fails closed when the reviewed fresh-install bundle is replayed", async () => {
  await db.exec("reset role");
  await expect(
    db.exec(
      readFileSync("supabase/review/promotion-release-reviewed.sql", "utf8"),
    ),
  ).rejects.toThrow(/already or partly installed/);
  await db.exec("rollback");
});
it("rejects financial snapshot mutation and cross-branch ledger records", async () => {
  await db.exec("reset role");
  const r = (
    await db.query<Record<string, unknown>>(
      "select * from promotion_redemptions where code='CGSVIP20' limit 1",
    )
  ).rows[0];
  await expect(
    db.query(
      "update promotion_redemptions set discount_sen=discount_sen+1 where id=$1",
      [r.id],
    ),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.query(
      "insert into promotion_redemptions select * from jsonb_populate_record(null::promotion_redemptions,$1::jsonb)",
      [
        JSON.stringify({
          ...r,
          id: crypto.randomUUID(),
          branch_id: crypto.randomUUID(),
          state: "reserved",
          sale_id: null,
        }),
      ],
    ),
  ).rejects.toThrow(/branch\/business mismatch/);
});
it("does not mark a promotion redeemed when sale lines or payment are missing", async () => {
  await who("", "service_role");
  const input = payload();
  const placed = await rpc<{ token: string }>("place_online_order", [
    input,
    bucket,
  ]);
  await db.exec("reset role");
  const o = (
    await db.query<{ id: string }>(
      "select id from online_orders where tracking_token=$1",
      [placed.token],
    )
  ).rows[0];
  const sess = (
    await db.query<{ id: string }>(
      "select id from cashier_sessions where cashier_id=$1 and status='open'",
      [owner],
    )
  ).rows[0].id;
  await db.exec("begin");
  const sale = crypto.randomUUID();
  await db.query(
    "insert into sales(id,idempotency_key,receipt_number,cashier_name,branch_id,cashier_id,session_id,subtotal_sen,discount_sen,tax_sen,total_sen) values($1,$2,$3,'Review',$4,$5,$6,1800,360,0,1440)",
    [sale, input.key, "TEST-" + sale, branch, owner, sess],
  );
  await expect(
    db.query("update online_orders set sale_id=$1,status='paid' where id=$2", [
      sale,
      o.id,
    ]),
  ).rejects.toThrow(/sale lines, tax or payment/);
  await db.exec("rollback");
  expect(
    (
      await db.query<{ state: string }>(
        "select state from promotion_redemptions where order_id=$1",
        [o.id],
      )
    ).rows[0].state,
  ).toBe("reserved");
  expect(
    (await db.query("select * from sales where id=$1", [sale])).rows,
  ).toHaveLength(0);
});
it("reports unsupported zero-payment totals clearly rather than creating an invalid order", async () => {
  await who();
  const value = offer({ percent_bps: 10000 });
  await rpc("manage_promotion", ["save", value]);
  await who("", "service_role");
  await expect(
    rpc("place_online_order", [
      payload({ promo_code: value.code, expected_total_sen: 1 }),
      bucket,
    ]),
  ).rejects.toThrow(/zero-payment orders/);
});
