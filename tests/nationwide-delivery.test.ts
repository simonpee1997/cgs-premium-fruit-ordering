import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deliveryQuote } from "../src/lib/delivery";
let db: PGlite, product: string, oldToken: string, quoteOid: number;
const owner = "30000000-0000-0000-0000-000000000001",
  branch = "20000000-0000-0000-0000-000000000001";
async function role(name = "service_role") {
  await db.exec(
    `reset role;select set_config('test.uid','${name === "authenticated" ? owner : ""}',false);set role ${name}`,
  );
}
async function rpc<T = Record<string, unknown>>(name: string, args: unknown[]) {
  return (
    await db.query<{ result: T }>(
      `select ${name}(${args.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
async function place(postcode: string, price: number, expected = price) {
  await role("postgres");
  await db.query("update products set price_sen=$1 where id=$2", [
    price,
    product,
  ]);
  await role();
  return rpc<{ token: string }>("place_online_order", [
    {
      key: crypto.randomUUID(),
      items: [{ product_id: product, quantity: 1 }],
      name: "Test customer",
      phone: "0100000000",
      email: "",
      fulfillment: "delivery",
      payment_method: "bank",
      address: "Test address with city and state",
      postcode,
      expected_total_sen: expected,
      notes: "",
      website: "",
    },
    "b".repeat(64),
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    readFileSync("tests/database.test.ts", "utf8").match(
      /`(create role anon;[^`]+)`/,
    )![1],
  );
  for (const file of [
    "001_core.sql",
    "002_voids.sql",
    "003_metadata.sql",
    "004_online_store.sql",
    "005_product_english_names.sql",
    "006_delivery_areas.sql",
    "007_payment_proofs.sql",
  ])
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Test owner','${branch}','owner');update inventory set quantity=100;update online_store_settings set enabled=true,allow_delivery=true,allow_pickup=true,pickup_address='Test collection address',delivery_note='Test delivery',bank_name='Test bank',bank_account_name='Test store',bank_account_number='TEST',delivery_fee_sen=3000,delivery_postcode_prefixes=array['51200'];`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
  oldToken = (await place("51200", 30000, 33000)).token;
  await role("postgres");
  quoteOid = (
    await db.query<{ oid: number }>(
      "select 'public.shop_delivery_quote(uuid,text,text,text,bigint,bigint)'::regprocedure::oid as oid",
    )
  ).rows[0].oid;
  await db.exec(
    readFileSync("supabase/migrations/008_nationwide_delivery.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("keeps function identity and previously placed order charges", async () => {
  await role("postgres");
  expect(
    (
      await db.query<{ oid: number }>(
        "select 'public.shop_delivery_quote(uuid,text,text,text,bigint,bigint)'::regprocedure::oid as oid",
      )
    ).rows[0].oid,
  ).toBe(quoteOid);
  await role();
  expect((await rpc("online_order_status", [oldToken])).delivery_fee_sen).toBe(
    3000,
  );
});
it("quotes any valid Malaysian postcode with free shipping exactly at RM300", async () => {
  await role();
  const catalogue = await rpc<{
    store: {
      free_delivery_all_postcodes: boolean;
      delivery_postcode_prefixes: string[];
    };
  }>("shop_catalogue", []);
  expect(catalogue.store.free_delivery_all_postcodes).toBe(true);
  expect(catalogue.store.delivery_postcode_prefixes).toEqual([]);
  for (const postcode of ["01000", "50000", "80000", "88000", "93000"])
    for (const price of [29999, 30000, 35000]) {
      const expected = price >= 30000 ? 0 : 3000;
      const client = deliveryQuote({
        fulfillment: "delivery",
        postcode,
        address: "Complete test address",
        subtotal_sen: price,
        default_fee_sen: 3000,
        free_all_postcodes: true,
      });
      expect(client.deliverable).toBe(true);
      expect(client.fee_sen).toBe(expected);
      await role("postgres");
      await db.query("update products set price_sen=$1 where id=$2", [
        price,
        product,
      ]);
      await role();
      const quote = await rpc<{ fee_sen: number; total_sen: number }>(
        "quote_online_order",
        [
          {
            items: [{ product_id: product, quantity: 1 }],
            fulfillment: "delivery",
            postcode,
            address: "Complete test address",
          },
        ],
      );
      expect(quote.fee_sen).toBe(expected);
      await role("postgres");
      expect(
        (
          await rpc("shop_delivery_quote", [
            branch,
            "delivery",
            postcode,
            "Complete test address",
            price,
            0,
          ])
        ).fee_sen,
      ).toBe(expected);
      await role();
    }
});
it("stores zero delivery in new orders and rejects incorrect totals and invalid postcodes", async () => {
  const placed = await place("93000", 30000);
  expect(
    (await rpc("online_order_status", [placed.token])).delivery_fee_sen,
  ).toBe(0);
  await expect(place("88000", 29999)).rejects.toThrow(/Prices/);
  const below = await place("88000", 29999, 32999);
  expect(
    (await rpc("online_order_status", [below.token])).delivery_fee_sen,
  ).toBe(3000);
  await expect(place("50", 30000)).rejects.toThrow(/postcode/);
  await role("postgres");
  expect(
    (
      await rpc("shop_delivery_quote", [
        branch,
        "delivery",
        "01000",
        "Complete test address",
        35000,
        5001,
      ])
    ).fee_sen,
  ).toBe(3000);
});
it("keeps internal pricing and backup functions inaccessible to anonymous clients", async () => {
  await role("anon");
  await expect(
    rpc("shop_delivery_quote", [
      branch,
      "delivery",
      "01000",
      "Complete test address",
      30000,
      0,
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(
    rpc("shop_delivery_quote_before_nationwide", [
      branch,
      "delivery",
      "01000",
      "Complete test address",
      30000,
      0,
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(rpc("shop_catalogue_before_nationwide", [])).rejects.toThrow(
    /permission denied/,
  );
  expect(
    (
      await rpc<{ store: { free_delivery_all_postcodes: boolean } }>(
        "shop_catalogue",
        [],
      )
    ).store.free_delivery_all_postcodes,
  ).toBe(true);
});
it("keeps another business's standard delivery rule", async () => {
  await role("postgres");
  await db.exec(
    "insert into businesses(id,name,ssm) values('10000000-0000-4000-8000-000000000002','Other business','OTHER');insert into branches(id,business_id,name) values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other branch');insert into online_store_settings(branch_id,delivery_fee_sen) values('20000000-0000-4000-8000-000000000002',1700)",
  );
  expect(
    (
      await rpc("shop_delivery_quote", [
        "20000000-0000-4000-8000-000000000002",
        "delivery",
        "93000",
        "Other complete address",
        30000,
        0,
      ])
    ).fee_sen,
  ).toBe(1700);
});
it("records the zero-shipping total only after staff confirms payment", async () => {
  const placed = await place("88000", 30000);
  await rpc("submit_online_payment", [placed.token, "TEST-PAYMENT"]);
  await role("postgres");
  const id = (
    await db.query<{ id: string }>(
      "select id from online_orders where tracking_token=$1",
      [placed.token],
    )
  ).rows[0].id;
  await role("authenticated");
  await rpc("retail_action", ["open_session", { opening_sen: 0 }]);
  const sale = await rpc<string>("manage_online_order", [
    "confirm_payment",
    { id, verified: true, reference: "TEST-PAYMENT", tendered_sen: 30000 },
  ]);
  expect(
    (
      await db.query<{ total_sen: number }>(
        "select total_sen from sales where id=$1",
        [sale],
      )
    ).rows[0].total_sen,
  ).toBe(30000);
  expect(
    (
      await db.query(
        "select * from sale_items where sale_id=$1 and product_id is null",
        [sale],
      )
    ).rows,
  ).toHaveLength(0);
});
it("calculates tax after free delivery without adding shipping back", async () => {
  await role("postgres");
  await db.exec("update system_settings set tax_bps=600");
  const placed = await place("93000", 30000, 31800);
  const receipt = await rpc("online_order_status", [placed.token]);
  expect(receipt.delivery_fee_sen).toBe(0);
  expect(receipt.tax_sen).toBe(1800);
  expect(receipt.total_sen).toBe(31800);
});
