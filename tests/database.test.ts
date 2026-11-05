import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
let db: PGlite;
const owner = "30000000-0000-0000-0000-000000000001",
  cashier = "30000000-0000-0000-0000-000000000002",
  manager = "30000000-0000-0000-0000-000000000003";
let product: string, sale: string, item: string;
async function who(id: string) {
  await db.exec(
    `reset role; select set_config('test.uid','${id}',false);set role authenticated;`,
  );
}
async function action(action: string, payload: object) {
  return (
    await db.query<{ id: string }>("select retail_action($1,$2::jsonb) id", [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].id;
}
async function check(payload: object) {
  return (
    await db.query<{ id: string }>("select checkout($1::jsonb) id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
}
function cart(key: string, quantity = 2) {
  return {
    key,
    items: [{ product_id: product, quantity, discount_sen: 0 }],
    discount_kind: "fixed",
    discount_value: 0,
    payments: [
      { method: "cash", amount_sen: 1800 * quantity, tendered_sen: 4000 },
    ],
  };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;`,
  );
  const sql = readFileSync("supabase/migrations/001_core.sql", "utf8").replace(
    "create extension if not exists pgcrypto;",
    "",
  );
  await db.exec(sql);
  await db.exec(readFileSync("supabase/migrations/002_voids.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/003_metadata.sql", "utf8"));
  await db.exec(
    `insert into auth.users values('${owner}'),('${cashier}'),('${manager}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Owner','20000000-0000-0000-0000-000000000001','owner'),('${cashier}','Cashier','20000000-0000-0000-0000-000000000001','cashier'),('${manager}','Manager','20000000-0000-0000-0000-000000000001','manager');`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL financial and permission boundaries", () => {
  it("seeds exactly 11 Chinese products with zero stock", async () => {
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int n from products",
    );
    expect(rows[0].n).toBe(11);
    expect(
      (
        await db.query<{ n: number }>(
          "select sum(quantity)::int n from inventory",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("denies direct writes and confidential costs to cashiers", async () => {
    await who(cashier);
    expect((await db.query("select * from product_costs")).rows).toHaveLength(
      0,
    );
    await expect(db.exec("update inventory set quantity=100")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      action("adjust_stock", {
        product_id: product,
        quantity: 10,
        reason: "test",
      }),
    ).rejects.toThrow(/Permission denied/);
    await expect(
      action("staff", { id: cashier, role: "owner" }),
    ).rejects.toThrow(/Permission denied/);
  });
  it("audits stock and opens a session", async () => {
    await who(owner);
    await action("adjust_stock", {
      product_id: product,
      quantity: 10,
      reason: "Initial physical count",
      type: "stock-in",
    });
    await who(cashier);
    await action("open_session", { opening_sen: 10000 });
  });
  it("rejects oversized discounts and insufficient tender without deducting stock", async () => {
    await who(cashier);
    const payload = cart(crypto.randomUUID());
    await expect(check({ ...payload, discount_value: 1 })).rejects.toThrow(
      /manager/,
    );
    await expect(
      check({
        ...payload,
        payments: [{ method: "cash", amount_sen: 3600, tendered_sen: 3500 }],
      }),
    ).rejects.toThrow(/insufficient/);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(10);
  });
  it("commits a sale with immutable cost snapshots and retry safety", async () => {
    await who(cashier);
    const payload = cart(crypto.randomUUID());
    sale = await check(payload);
    expect(await check(payload)).toBe(sale);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(8);
    item = (
      await db.query<{ id: string }>(
        "select id from sale_items where sale_id=$1",
        [sale],
      )
    ).rows[0].id;
    expect((await db.query("select * from sale_item_costs")).rows).toHaveLength(
      0,
    );
    await who(owner);
    expect(
      (
        await db.query<{ cost_sen: number }>(
          "select cost_sen from sale_item_costs where sale_item_id=$1",
          [item],
        )
      ).rows[0].cost_sen,
    ).toBe(900);
  });
  it("prevents overselling and cashier refunds", async () => {
    await who(cashier);
    await expect(check(cart(crypto.randomUUID(), 9))).rejects.toThrow(
      /Insufficient stock/,
    );
    await expect(
      action("refund", {
        key: crypto.randomUUID(),
        sale_id: sale,
        sale_item_id: item,
        quantity: 1,
        method: "bank",
        reason: "Customer return",
        restock: false,
      }),
    ).rejects.toThrow(/Permission denied/);
  });
  it("refunds without restocking damaged goods and prevents over-refunds", async () => {
    await who(manager);
    const payload = {
      key: crypto.randomUUID(),
      sale_id: sale,
      sale_item_id: item,
      quantity: 1,
      method: "bank",
      reason: "Damaged goods",
      restock: false,
    };
    const refund = await action("refund", payload);
    expect(await action("refund", payload)).toBe(refund);
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(8);
    await expect(
      action("refund", { ...payload, key: crypto.randomUUID(), quantity: 2 }),
    ).rejects.toThrow(/exceeds/);
  });
  it("restocks only inspected returns and fully reconciles cash", async () => {
    await who(manager);
    await action("refund", {
      key: crypto.randomUUID(),
      sale_id: sale,
      sale_item_id: item,
      quantity: 1,
      method: "bank",
      reason: "Sealed return",
      restock: true,
    });
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(9);
    await who(cashier);
    const session = (
      await db.query<{ id: string }>(
        "select id from cashier_sessions where status='open'",
      )
    ).rows[0].id;
    await action("close_session", { id: session, actual_sen: 13600 });
    const closing = (
      await db.query<{ expected_sen: number; difference_sen: number }>(
        "select expected_sen,difference_sen from cashier_sessions where id=$1",
        [session],
      )
    ).rows[0];
    expect(closing.expected_sen).toBe(13600);
    expect(closing.difference_sen).toBe(0);
    await who(manager);
    await action("approve_session", { id: session });
    await expect(
      action("cash_movement", {
        session_id: session,
        amount_sen: 100,
        reason: "late",
      }),
    ).rejects.toThrow();
  });
  it("receives purchase orders exactly once", async () => {
    await who(owner);
    const supplier = await action("supplier", { name: "Test supplier" });
    const po = await action("purchase_order", {
      supplier_id: supplier,
      product_id: product,
      quantity: 5,
      cost_sen: 900,
    });
    await action("receive_order", { id: po });
    await expect(action("receive_order", { id: po })).rejects.toThrow();
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from inventory where product_id=$1",
          [product],
        )
      ).rows[0].quantity,
    ).toBe(14);
  });
  it("applies approved fixed discounts and tax with exact refund allocation", async () => {
    await who(owner);
    await action("settings", { tax_bps: 600, cashier_discount_bps: 1000 });
    await who(cashier);
    await action("open_session", { opening_sen: 0 });
    const key = crypto.randomUUID();
    const s = await check({
      ...cart(key, 3),
      discount_value: 1,
      payments: [
        {
          method: "bank",
          amount_sen: 5723,
          tendered_sen: 5723,
          reference: "TEST-TRANSFER",
        },
      ],
    });
    await who(manager);
    const i = (
      await db.query<{ id: string }>(
        "select id from sale_items where sale_id=$1",
        [s],
      )
    ).rows[0].id;
    for (let n = 0; n < 3; n++)
      await action("refund", {
        key: crypto.randomUUID(),
        sale_id: s,
        sale_item_id: i,
        quantity: 1,
        method: "bank",
        reason: "Sealed return",
        restock: true,
      });
    const values = (
      await db.query<{ total: number; tax: number }>(
        "select sum(total_sen)::int total,sum(tax_sen)::int tax from refunds where sale_id=$1",
        [s],
      )
    ).rows[0];
    expect(values.total).toBe(5723);
    expect(values.tax).toBe(324);
  });
  it("voids remaining quantities atomically, idempotently and with permission checks", async () => {
    await who(cashier);
    const s = await check({
      ...cart(crypto.randomUUID(), 1),
      payments: [
        {
          method: "debit",
          amount_sen: 1908,
          tendered_sen: 1908,
          reference: "TEST-DEBIT",
        },
      ],
    });
    const payload = {
      sale_id: s,
      method: "bank",
      reason: "Transaction correction",
      restock: true,
    };
    await expect(
      db.query("select void_sale($1::jsonb)", [JSON.stringify(payload)]),
    ).rejects.toThrow(/Permission denied/);
    await who(manager);
    const first = await db.query("select void_sale($1::jsonb) id", [
      JSON.stringify(payload),
    ]);
    const retry = await db.query("select void_sale($1::jsonb) id", [
      JSON.stringify(payload),
    ]);
    expect(first.rows).toEqual(retry.rows);
    expect(
      (
        await db.query<{ n: number }>(
          "select sum(total_sen)::int n from refunds where sale_id=$1",
          [s],
        )
      ).rows[0].n,
    ).toBe(1908);
  });
  it("fails closed for deactivated accounts and hides other cashier sales", async () => {
    await who(owner);
    await action("staff", {
      id: manager,
      display_name: "Manager",
      role: "manager",
      active: false,
    });
    await who(manager);
    await expect(action("supplier", { name: "Not permitted" })).rejects.toThrow(
      /Permission denied/,
    );
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
  });
  it("supports owner customer edits while blocking cashier privilege over customer records", async () => {
    await who(cashier);
    const customer = await action("customer", {
      name: "Customer",
      marketing_consent: false,
    });
    await expect(
      action("customer", {
        id: customer,
        name: "Changed",
        loyalty_points: 100,
      }),
    ).rejects.toThrow(/Permission denied/);
    await who(owner);
    await action("customer", {
      id: customer,
      name: "Customer",
      loyalty_points: 100,
      membership_tier: "Gold",
      marketing_consent: false,
    });
    expect(
      (
        await db.query<{ loyalty_points: number }>(
          "select loyalty_points from customers where id=$1",
          [customer],
        )
      ).rows[0].loyalty_points,
    ).toBe(100);
  });
  it("records a fully discounted sale without inventing a payment", async () => {
    await who(owner);
    await action("settings", { tax_bps: 600, cashier_discount_bps: 10000 });
    await who(cashier);
    const id = await check({
      ...cart(crypto.randomUUID(), 1),
      discount_kind: "percent",
      discount_value: 10000,
      payments: [],
    });
    expect(
      (
        await db.query<{ total_sen: number }>(
          "select total_sen from sales where id=$1",
          [id],
        )
      ).rows[0].total_sen,
    ).toBe(0);
    expect(
      (await db.query("select * from payments where sale_id=$1", [id])).rows,
    ).toHaveLength(0);
  });
});
