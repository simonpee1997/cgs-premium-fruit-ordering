// Isolated development verification only. Never accepts a remote database URL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const socket = process.env.PG_TEST_SOCKET;
assert(
  socket?.startsWith("/tmp/chipsti-postgres"),
  "Only the disposable local test socket is allowed",
);
const { default: pg } = await import(process.env.PG_TEST_CLIENT_MODULE || "pg");
const base = {
  host: socket,
  port: 55432,
  user: "chipsti_test",
  database: "postgres",
};
const admin = new pg.Client(base);
await admin.connect();
const owner = "30000000-0000-0000-0000-000000000001";
const branch = "20000000-0000-0000-0000-000000000001";
const bundle = readFileSync(
  "supabase/review/promotion-release-reviewed.sql",
  "utf8",
);
const preflight = readFileSync("supabase/review/schema-preflight.sql", "utf8");
const results = [];
const connections = [];
async function client(database) {
  const c = new pg.Client({ ...base, database });
  await c.connect();
  connections.push(c);
  return c;
}
async function fresh(suffix) {
  const name = "chipsti_review_" + suffix + "_" + Date.now();
  await admin.query(`create database ${name}`);
  const c = await client(name);
  await c.query(
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
  ])
    await c.query(
      readFileSync(`supabase/migrations/${n}.sql`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  return { name, c };
}
async function rpc(c, name, args = []) {
  return (
    await c.query(
      `select ${name}(${args.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
async function start(c, role = "service_role") {
  await c.query("reset role");
  if (role === "authenticated") {
    await c.query("select set_config('test.uid',$1,false)", [owner]);
    await c.query("set role authenticated");
  } else if (role === "service_role") await c.query("set role service_role");
  await c.query("begin");
}
async function waitLock(c) {
  for (let i = 0; i < 100; i++) {
    const r = await admin.query(
      "select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",
      [c.processID],
    );
    if (r.rows[0]?.waiting) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Independent PostgreSQL client did not reach the expected lock");
}
async function pastDeadline(c, sql, args) {
  const ms = Number((await c.query(sql, args)).rows[0].remaining);
  await new Promise((r) => setTimeout(r, Math.max(0, ms) + 70));
}
try {
  const { name, c } = await fresh("races");
  await c.query(preflight);
  await c.query(
    "alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;alter default privileges in schema public grant all on tables to anon,authenticated,service_role",
  );
  await c.query(bundle);
  assert.equal(
    (
      await c.query(
        "select publication_status from promotions where code='CGSVIP20'",
      )
    ).rows[0].publication_status,
    "draft",
  );
  await c.query(
    readFileSync(
      "supabase/review/activate-cgsvip20-after-approval.sql",
      "utf8",
    ),
  );
  assert.equal(
    (
      await c.query(
        "select publication_status from promotions where code='CGSVIP20'",
      )
    ).rows[0].publication_status,
    "published",
  );
  await c.query(
    readFileSync(
      "supabase/review/activate-cgsvip20-after-approval.sql",
      "utf8",
    ),
  );
  results.push(
    "PASS: schema bundle does not publish; the separate reviewed activation is explicit and idempotent in development",
  );
  const a = await client(name),
    b = await client(name);
  for (const signature of [
    "require_promotion_owner()",
    "validate_promotion_items(jsonb)",
    "validate_online_pricing_payload(jsonb)",
    "validate_promotion_redemption()",
    "evaluate_promotion(uuid,jsonb,timestamptz,boolean,bigint)",
    "reserve_promotion_for_order(text,uuid)",
    "manage_online_order_before_delivery(text,jsonb)",
    "retail_action_before_promotions(text,jsonb)",
  ]) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(
        (
          await c.query(
            "select has_function_privilege($1,$2,'execute') allowed",
            [role, signature],
          )
        ).rows[0].allowed,
        false,
      );
    }
  }
  assert.equal(
    (
      await c.query(
        "select has_function_privilege('service_role','shop_promotion_quote(text,jsonb)','execute') allowed",
      )
    ).rows[0].allowed,
    true,
  );
  assert.equal(
    (
      await c.query(
        "select has_function_privilege('anon','shop_promotion_quote(text,jsonb)','execute') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  results.push(
    "PASS: native PostgreSQL default-privilege matrix keeps private helpers denied and guest quotes server-only",
  );

  await c.query(
    `insert into auth.users values('${owner}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Isolated owner','${branch}','owner');update inventory set quantity=1000;update products set price_sen=10000;update online_store_settings set enabled=true,allow_cash_pickup=true,pickup_address='Isolated test only';insert into cashier_sessions(branch_id,cashier_id,opening_sen) values('${branch}','${owner}',0)`,
  );
  const product = (await c.query("select id from products where sku='LF-02'"))
    .rows[0].id;
  const payload = (code, extra = {}) => ({
    key: crypto.randomUUID(),
    expected_total_sen: 8000,
    name: "Isolated review fixture",
    phone: "0100000000",
    email: "",
    fulfillment: "pickup",
    address: "",
    postcode: "",
    notes: "No production data",
    payment_method: "cash",
    website: "",
    items: [{ product_id: product, quantity: 1 }],
    promo_code: code,
    ...extra,
  });
  async function createCode(code, { limited = false, short = false } = {}) {
    await c.query(
      `insert into promotions(name,code,branch_id,percent_bps,starts_at,ends_at,active,publication_status,max_redemptions) values('Local review',$1,$2,2000,clock_timestamp()-interval '1 hour',${short ? "date_trunc('second',clock_timestamp())+interval '2.999999 seconds'" : "clock_timestamp()+interval '1 day'"},false,'published',${limited ? "1" : "null"})`,
      [code, branch],
    );
  }
  await createCode("LIMITONE", { limited: true });
  await start(a);
  await start(b);
  const firstPayload = payload("LIMITONE");
  const first = await rpc(a, "place_online_order", [
    firstPayload,
    "a".repeat(64),
  ]);
  const blocked = rpc(b, "place_online_order", [
    payload("LIMITONE"),
    "b".repeat(64),
  ]).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  await waitLock(b);
  await a.query("commit");
  assert.match(
    (await blocked).error?.message || "",
    /Redemption Limit Reached/,
  );
  await b.query("rollback");
  const retries = await Promise.all([
    rpc(a, "place_online_order", [firstPayload, "a".repeat(64)]),
    rpc(b, "place_online_order", [firstPayload, "a".repeat(64)]),
  ]);
  for (const retry of retries) assert.equal(retry.token, first.token);
  assert.equal(
    (
      await c.query(
        "select count(*)::int n from promotion_redemptions where code='LIMITONE'",
      )
    ).rows[0].n,
    1,
  );
  results.push(
    "PASS: actual final-slot lock contention and concurrent idempotent retries",
  );
  const firstOrder = (
    await c.query("select id from online_orders where tracking_token=$1", [
      first.token,
    ])
  ).rows[0].id;
  await start(b, "authenticated");
  const paid = await rpc(b, "manage_online_order", [
    "confirm_payment",
    { id: firstOrder, verified: true, tendered_sen: 8000 },
  ]);
  await b.query("commit");
  const settled = (
    await c.query(
      "select s.discount_sen,s.total_sen,r.state,(select sum(amount_sen)::int from payments where sale_id=s.id) received from sales s join promotion_redemptions r on r.sale_id=s.id where s.id=$1",
      [paid],
    )
  ).rows[0];
  assert.equal(Number(settled.discount_sen), 2000);
  assert.equal(Number(settled.total_sen), 8000);
  assert.equal(settled.received, 8000);
  assert.equal(settled.state, "redeemed");
  results.push(
    "PASS: native payment confirmation records the exact discount, net sale, received funds and redeemed ledger",
  );
  await start(b, "authenticated");
  const legacy = await rpc(b, "retail_action", [
    "promotion",
    {
      name: "Local legacy POS",
      percent_bps: 1000,
      starts_at: "2020-01-01T00:00:00Z",
      ends_at: "2090-01-01T00:00:00Z",
    },
  ]);
  const legacySale = await rpc(b, "checkout", [
    {
      key: crypto.randomUUID(),
      items: [{ product_id: product, quantity: 1, discount_sen: 0 }],
      discount_kind: "fixed",
      discount_value: 0,
      promotion_id: legacy,
      payments: [{ method: "cash", amount_sen: 9000, tendered_sen: 9000 }],
    },
  ]);
  await b.query("commit");
  const legacyTotals = (
    await c.query("select discount_sen,total_sen from sales where id=$1", [
      legacySale,
    ])
  ).rows[0];
  assert.equal(Number(legacyTotals.discount_sen), 1000);
  assert.equal(Number(legacyTotals.total_sen), 9000);
  results.push(
    "PASS: a new legacy POS promotion sale still follows its original 10% calculation",
  );
  await createCode("EXPWAIT", { short: true });
  await start(a, "admin");
  await a.query("select id from promotions where code='EXPWAIT' for update");
  await start(b);
  const transactionStart = (await b.query("select transaction_timestamp() t"))
    .rows[0].t;
  const expiredPayload = payload("EXPWAIT");
  const pending = rpc(b, "place_online_order", [
    expiredPayload,
    "c".repeat(64),
  ]).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  await waitLock(b);
  const end = (
    await c.query("select ends_at from promotions where code='EXPWAIT'")
  ).rows[0].ends_at;
  assert(transactionStart < end);
  await pastDeadline(
    c,
    "select extract(epoch from (ends_at-clock_timestamp()))*1000 remaining from promotions where code='EXPWAIT'",
  );
  await a.query("commit");
  assert.match((await pending).error?.message || "", /Expired/);
  await b.query("rollback");
  assert.equal(
    (
      await c.query(
        "select count(*)::int n from online_orders where idempotency_key=$1",
        [expiredPayload.key],
      )
    ).rows[0].n,
    0,
  );
  results.push(
    "PASS: a transaction started before expiry cannot redeem after waiting past expiry",
  );
  await createCode("PAUSEWAIT");
  await start(a, "admin");
  await a.query(
    "update promotions set publication_status='paused' where code='PAUSEWAIT'",
  );
  await start(b);
  const pausing = rpc(b, "place_online_order", [
    payload("PAUSEWAIT"),
    "1".repeat(64),
  ]).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  await waitLock(b);
  await a.query("commit");
  assert.match((await pausing).error?.message || "", /Paused/);
  await b.query("rollback");
  results.push(
    "PASS: a pause committed while checkout waits is observed before redemption",
  );
  await createCode("STARTWAIT");
  await c.query(
    "update promotions set starts_at=clock_timestamp()+interval '2 seconds' where code='STARTWAIT'",
  );
  await start(a, "admin");
  await a.query("select id from promotions where code='STARTWAIT' for update");
  await start(b);
  const starting = rpc(b, "place_online_order", [
    payload("STARTWAIT"),
    "2".repeat(64),
  ]).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  await waitLock(b);
  await pastDeadline(
    c,
    "select extract(epoch from (starts_at-clock_timestamp()))*1000 remaining from promotions where code='STARTWAIT'",
  );
  await a.query("commit");
  const started = await starting;
  assert.equal(started.error, undefined);
  assert(started.result?.token);
  await b.query("commit");
  results.push(
    "PASS: a published scheduled code becomes redeemable using actual server time after waiting",
  );
  await createCode("LATEPAY", { limited: true });
  const latePayload = payload("LATEPAY");
  const placed = await rpc(a, "place_online_order", [
    latePayload,
    "d".repeat(64),
  ]);
  const o = (
    await c.query("select id from online_orders where tracking_token=$1", [
      placed.token,
    ])
  ).rows[0];
  await c.query(
    "update online_orders set expires_at=clock_timestamp()+interval '2 seconds' where id=$1",
    [o.id],
  );
  await c.query(
    "update promotion_redemptions set expires_at=(select expires_at from online_orders where id=$1) where order_id=$1",
    [o.id],
  );
  await start(a, "admin");
  await a.query(
    "select * from inventory where branch_id=$1 and product_id=$2 for update",
    [branch, product],
  );
  await start(b, "authenticated");
  const late = rpc(b, "manage_online_order", [
    "confirm_payment",
    { id: o.id, verified: true, tendered_sen: 8000 },
  ]).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  await waitLock(b);
  await pastDeadline(
    c,
    "select extract(epoch from (expires_at-clock_timestamp()))*1000 remaining from online_orders where id=$1",
    [o.id],
  );
  await a.query("commit");
  assert.match((await late).error?.message || "", /expired while waiting/);
  await b.query("rollback");
  assert.equal(
    (
      await c.query(
        "select count(*)::int n from sales where idempotency_key=$1",
        [latePayload.key],
      )
    ).rows[0].n,
    0,
  );
  await a.query("reset role;set role service_role");
  await rpc(a, "place_online_order", [payload("LATEPAY"), "e".repeat(64)]);
  results.push(
    "PASS: late confirmation cannot consume an expired hold or exceed a reallocated quota",
  );
  await createCode("QRWAIT");
  await a.query("reset role;set role service_role");
  const proof = await rpc(a, "prepare_payment_proof", [
    {
      key: crypto.randomUUID(),
      filename: "local.png",
      mime_type: "image/png",
      byte_size: 68,
      sha256: "c".repeat(64),
      total_sen: 8000,
    },
    "f".repeat(64),
  ]);
  await rpc(a, "complete_payment_proof", [proof.id, proof.token, true]);
  await c.query(
    "update payment_proofs set expires_at=clock_timestamp()+interval '2 seconds' where id=$1",
    [proof.id],
  );
  await start(a, "admin");
  await a.query("select id from promotions where code='QRWAIT' for update");
  await start(b);
  const qrPayload = payload("QRWAIT", {
    payment_method: "duitnow",
    proof_id: proof.id,
    proof_token: proof.token,
  });
  const qr = rpc(b, "place_online_order", [qrPayload, "f".repeat(64)]).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  await waitLock(b);
  await pastDeadline(
    c,
    "select extract(epoch from (expires_at-clock_timestamp()))*1000 remaining from payment_proofs where id=$1",
    [proof.id],
  );
  await a.query("commit");
  assert.match((await qr).error?.message || "", /Payment proof expired/);
  await b.query("rollback");
  assert.equal(
    (
      await c.query(
        "select count(*)::int n from online_orders where idempotency_key=$1",
        [qrPayload.key],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await c.query("select order_id from payment_proofs where id=$1", [
        proof.id,
      ])
    ).rows[0].order_id,
    null,
  );
  results.push(
    "PASS: proof expiring behind a lock is not bound to a new order",
  );
  const { c: rollback } = await fresh("rollback");
  const before = (await rollback.query("select count(*)::int n from products"))
    .rows[0].n;
  const broken = bundle.replace(
    "\ncommit;\n-- END CHIPSTI",
    "\nselect 1/0;\ncommit;\n-- END CHIPSTI",
  );
  await assert.rejects(rollback.query(broken), (e) => e.code === "22012");
  await rollback.query("rollback");
  assert.equal(
    (
      await rollback.query(
        "select to_regclass('public.promotion_redemptions') r",
      )
    ).rows[0].r,
    null,
  );
  assert.equal(
    (await rollback.query("select count(*)::int n from products")).rows[0].n,
    before,
  );
  await rollback.query(preflight);
  results.push(
    "PASS: injected late failure rolls back the complete bundle and restores baseline preflight",
  );
  await rollback.query(
    "create or replace function quote_online_order(payload jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $drift$begin return '{}'::jsonb;end$drift$",
  );
  await assert.rejects(rollback.query(bundle), /differs from the reviewed/);
  await rollback.query("rollback");
  assert.equal(
    (
      await rollback.query(
        "select to_regclass('public.promotion_redemptions') r",
      )
    ).rows[0].r,
    null,
  );
  results.push(
    "PASS: a manually changed existing function stops the release before DDL",
  );
  const tag = "$shop_promotion_quote$";
  const truncation = bundle.slice(
    0,
    bundle.indexOf(tag, bundle.indexOf(tag) + tag.length),
  );
  await assert.rejects(rollback.query(truncation), (e) => e.code === "42601");
  await rollback.query("rollback");
  assert.equal(
    (
      await rollback.query(
        "select to_regclass('public.promotion_redemptions') r",
      )
    ).rows[0].r,
    null,
  );
  results.push(
    "PASS: truncating a dollar-quoted function reproduces SQLSTATE 42601 without applying the release",
  );
  await rollback.query(
    "alter table products rename column price_sen to review_old_price",
  );
  await assert.rejects(rollback.query(bundle), /Schema differs/);
  await rollback.query("rollback");
  assert.equal(
    (
      await rollback.query(
        "select to_regclass('public.promotion_redemptions') r",
      )
    ).rows[0].r,
    null,
  );
  results.push("PASS: a required column mismatch stops the release before DDL");
  await rollback.query(
    "update businesses set name='Unrelated fixture' where id='10000000-0000-0000-0000-000000000001'",
  );
  await assert.rejects(rollback.query(bundle), /not CHIPSTI POS/);
  await rollback.query("rollback");
  assert.equal(
    (
      await rollback.query(
        "select to_regclass('public.promotion_redemptions') r",
      )
    ).rows[0].r,
    null,
  );
  results.push(
    "PASS: an unrelated business identity cannot receive this migration",
  );
  const badBusiness = (await c.query("select id from businesses")).rows[0].id;
  assert.equal(badBusiness, "10000000-0000-0000-0000-000000000001");
  console.log(results.join("\n"));
  console.log(
    JSON.stringify({
      tests: results.length,
      productionAccessed: false,
      bundle_sha256: createHash("sha256").update(bundle).digest("hex"),
      localDatabase: name,
    }),
  );
} finally {
  await Promise.allSettled(connections.map((c) => c.end()));
  await admin.end();
}
