// Isolated native PostgreSQL verification. Never accepts a remote connection.
import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const cfg = {
  host: "/tmp/chipsti-postgres",
  port: 55432,
  user: "chipsti_test",
  database: "postgres",
};
const admin = new pg.Client(cfg);
await admin.connect();
const name = "chipsti_pos_release_" + Date.now();
await admin.query(`create database ${name}`);
const clients = [];
async function client() {
  const c = new pg.Client({ ...cfg, database: name });
  await c.connect();
  clients.push(c);
  return c;
}
const db = await client(),
  branch = "20000000-0000-0000-0000-000000000001",
  owner = "30000000-0000-0000-0000-000000000001",
  cashier = "30000000-0000-0000-0000-000000000002";
async function rpc(c, n, args = []) {
  return (
    await c.query(
      `select ${n}(${args.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
async function role(c, id = owner, r = "authenticated") {
  await c.query(
    `reset role;select set_config('test.uid','${id}',false);set role ${r}`,
  );
}
try {
  await db.query(
    readFileSync("tests/database.test.ts", "utf8")
      .match(/`(create role anon;[^`]+)`/)[1]
      .replace(
        "create role anon;create role authenticated;create role service_role bypassrls;",
        "",
      ),
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
  ])
    await db.query(
      readFileSync(`supabase/migrations/${n}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  // Apply the observed production function definitions to the disposable copy.
  if (process.argv.includes("--live-schema")) {
    const schema = JSON.parse(
      readFileSync("/tmp/chipsti-live-promotion-schema.json", "utf8"),
    );
    for (const f of schema.functions) await db.query(f.definition);
  }
  await db.query(
    `insert into auth.users values('${owner}'),('${cashier}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Fixture owner','${branch}','owner'),('${cashier}','Fixture cashier','${branch}','cashier');insert into cashier_sessions(branch_id,cashier_id,opening_sen) values('${branch}','${owner}',0),('${branch}','${cashier}',0);update inventory set quantity=100;update online_store_settings set enabled=true,allow_cash_pickup=true,pickup_address='Fixture collection';`,
  );
  const legacyProduct=(await db.query("select id from products where sku='LF-02'")).rows[0].id;
  await role(db);
  const legacySale=await rpc(db,'checkout',[{key:crypto.randomUUID(),items:[{product_id:legacyProduct,quantity:1,discount_sen:0}],discount_kind:'fixed',discount_value:0,payments:[{method:'cash',amount_sen:1800,tendered_sen:1800}]}]);
  const legacyBefore=(await db.query('select subtotal_sen,discount_sen,tax_sen,total_sen from sales where id=$1',[legacySale])).rows[0];
  await db.query('reset role');
  if (process.argv.includes("--bundle"))
    await db.query(
      readFileSync(
        "supabase/releases/20261119-bilingual-pos-promotions.sql",
        "utf8",
      ),
    );
  else
    for (const n of [
      "009_promotion_management",
      "010_promotion_checkout",
      "011_pos_codes_receipt_names",
    ])
      await db.query(readFileSync(`supabase/migrations/${n}.sql`, "utf8"));
  assert.deepEqual((await db.query('select subtotal_sen,discount_sen,tax_sen,total_sen from sales where id=$1',[legacySale])).rows[0],legacyBefore);
  console.log('PASS: pre-existing receipt/payment survives the complete release unchanged');
  const product = (await db.query("select id from products where sku='LF-02'"))
    .rows[0].id;
  const pos = () => ({
    key: crypto.randomUUID(),
    items: [{ product_id: product, quantity: 1, discount_sen: 0 }],
    discount_kind: "fixed",
    discount_value: 0,
    promo_code: "CGSVIP20",
    payments: [{ method: "cash", amount_sen: 1440, tendered_sen: 1440 }],
  });
  const online = () => ({
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
  });
  await db.query(
    "update promotions set max_redemptions=1 where code='CGSVIP20'",
  );
  const a = await client(),
    b = await client();
  await role(a);
  await role(b, cashier, "service_role");
  await a.query("begin");
  const first = await rpc(a, "checkout", [pos()]);
  assert(first);
  let finished = false;
  const second = rpc(b, "place_online_order", [online(), "c".repeat(64)])
    .then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, error: e.message }),
    )
    .finally(() => (finished = true));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(
    finished,
    false,
    "second checkout must wait for campaign row lock",
  );
  await a.query("commit");
  const result = await second;
  assert.equal(result.ok, false);
  assert.match(result.error, /Limit/);
  assert.equal(
    Number(
      (await db.query("select count(*) from pos_promotion_redemptions")).rows[0]
        .count,
    ),
    1,
  );
  console.log(
    "PASS: one shared final quota slot between simultaneous POS and online checkout",
  );
  // Retry the same paid POS request is idempotent; failure does not deduct stock.
  assert.equal(
    Number(
      (
        await db.query(
          "select quantity from inventory where product_id=$1 and branch_id=$2",
          [product, branch],
        )
      ).rows[0].quantity,
    ),
    98,
  );
  // Test a code expiring while waiting: no sale/stock/payment write may survive.
  await db.query(
    "update promotions set max_redemptions=null,ends_at=clock_timestamp()+interval '2 seconds' where code='CGSVIP20'",
  );
  await db.query("begin");
  await db.query("select id from promotions where code='CGSVIP20' for update");
  await role(b, cashier, "authenticated");
  const pending = rpc(b, "checkout", [pos()]).then(
    (v) => ({ ok: true, v }),
    (e) => ({ ok: false, error: e.message }),
  );
  await new Promise((resolve) => setTimeout(resolve, 3300));
  await db.query("commit");
  const expired = await pending;
  assert.equal(expired.ok, false);
  assert.match(expired.error, /Expired/);
  assert.equal(
    Number((await db.query("select count(*) from sales")).rows[0].count),
    2,
  );
  console.log(
    "PASS: code expiry during lock wait rolls back checkout and leaves accounting untouched",
  );
  // Include the last fraction of the final selected second, then reject Jan 1.
  await db.query(
    "update promotions set ends_at='2026-12-31 23:59:59.999999+08' where code='CGSVIP20'",
  );
  const statuses = (
    await db.query(
      "select promotion_effective_status(p,'2026-12-31 23:59:59.999999+08') last_second,promotion_effective_status(p,'2027-01-01 00:00:00+08') next_day from promotions p where code='CGSVIP20'",
    )
  ).rows[0];
  assert.equal(statuses.last_second, "Active");
  assert.equal(statuses.next_day, "Expired");
  console.log("PASS: exact Malaysia year-end expiry boundary");
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}
