// Optional real PostgreSQL check. Only an isolated /tmp Unix socket is accepted.
// Install pg outside this repo and set PG_TEST_CLIENT_MODULE to its ESM path.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const socket = process.env.PG_TEST_SOCKET;
assert(
  socket?.startsWith("/tmp/chipsti-postgres"),
  "Only the isolated CHIPSTI /tmp test socket is allowed",
);
const { default: pg } = await import(process.env.PG_TEST_CLIENT_MODULE || "pg");
const config = {
  host: socket,
  port: 55432,
  user: "chipsti_test",
  database: "postgres",
};
const admin = new pg.Client(config),
  a = new pg.Client(config),
  b = new pg.Client(config);
await Promise.all([admin.connect(), a.connect(), b.connect()]);
try {
  await admin.query(
    readFileSync("tests/database.test.ts", "utf8").match(
      /`(create role anon;[^`]+)`/,
    )[1],
  );
  for (const migration of [
    "001_core",
    "002_voids",
    "003_metadata",
    "004_online_store",
    "006_delivery_areas",
    "007_payment_proofs",
    "008_promotion_management",
    "009_promotion_checkout",
  ])
    await admin.query(
      readFileSync(`supabase/migrations/${migration}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await admin.query(
    "update online_store_settings set enabled=true,allow_pickup=true,allow_cash_pickup=true,pickup_address='Local test only';update inventory set quantity=100;update products set price_sen=10000;update system_settings set tax_bps=0;insert into promotions(name,code,branch_id,percent_bps,starts_at,ends_at,active,publication_status,max_redemptions) values('Local quota test','LIMITONE','20000000-0000-0000-0000-000000000001',2000,now()-interval '1 hour',now()+interval '1 hour',false,'published',1)",
  );
  const product = (
    await admin.query("select id from products where sku='LF-02'")
  ).rows[0].id;
  const payload = () => ({
    key: crypto.randomUUID(),
    expected_total_sen: 8000,
    name: "Local fixture",
    phone: "0100000000",
    email: "",
    fulfillment: "pickup",
    address: "",
    postcode: "",
    notes: "Isolated concurrency test",
    payment_method: "cash",
    website: "",
    items: [{ product_id: product, quantity: 1 }],
    promo_code: "LIMITONE",
  });
  await Promise.all([
    a.query("set role service_role;begin"),
    b.query("set role service_role;begin"),
  ]);
  const firstPayload = payload();
  const first = await a.query(
    "select place_online_order($1::jsonb,$2) result",
    [JSON.stringify(firstPayload), "e".repeat(64)],
  );
  const blocked = b
    .query("select place_online_order($1::jsonb,$2) result", [
      JSON.stringify(payload()),
      "f".repeat(64),
    ])
    .then(
      (r) => ({ result: r }),
      (e) => ({ error: e }),
    );
  let waiting = false;
  for (let i = 0; i < 40; i++) {
    const locks = await admin.query(
      "select count(*)::int n from pg_stat_activity where datname='postgres' and wait_event_type='Lock' and query like 'select place_online_order%'",
    );
    if (locks.rows[0].n > 0) {
      waiting = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  assert(
    waiting,
    "Second independent PostgreSQL transaction must wait on the promotion lock",
  );
  await a.query("commit");
  const loser = await blocked;
  assert.match(loser.error?.message || "", /Redemption Limit Reached/);
  await b.query("rollback");
  assert.equal(
    (await admin.query("select count(*)::int n from online_orders")).rows[0].n,
    1,
  );
  assert.equal(
    (await admin.query("select count(*)::int n from promotion_redemptions"))
      .rows[0].n,
    1,
  );
  // Two simultaneous network clients retry the same completed request.
  const retries = await Promise.all([
    a.query("select place_online_order($1::jsonb,$2) result", [
      JSON.stringify(firstPayload),
      "e".repeat(64),
    ]),
    b.query("select place_online_order($1::jsonb,$2) result", [
      JSON.stringify(firstPayload),
      "e".repeat(64),
    ]),
  ]);
  for (const r of retries)
    assert.equal(r.rows[0].result.token, first.rows[0].result.token);
  assert.equal(
    (await admin.query("select count(*)::int n from online_orders")).rows[0].n,
    1,
  );
  assert.equal(
    (await admin.query("select count(*)::int n from promotion_redemptions"))
      .rows[0].n,
    1,
  );
  console.log(
    "PASS: real PostgreSQL lock contention, final-slot quota enforcement and concurrent idempotent retries (one order, one redemption).",
  );
} finally {
  await Promise.allSettled([a.end(), b.end(), admin.end()]);
}
