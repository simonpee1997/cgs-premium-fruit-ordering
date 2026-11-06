import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deliveryQuote } from "../src/lib/delivery";
import { deliveryAreasSchema } from "../src/lib/shop-validation";
import type { DeliveryArea } from "../src/lib/shop-types";
const areas: DeliveryArea[] = [
  {
    id: "90000000-0000-4000-8000-000000000001",
    name: "Test KV area",
    postcodes: ["50000", "50050"],
    standard_fee_sen: 800,
    free_delivery_eligible: true,
  },
  {
    id: "90000000-0000-4000-8000-000000000002",
    name: "Test non-KV area",
    postcodes: ["80000"],
    standard_fee_sen: 1500,
    free_delivery_eligible: false,
  },
];
const address = "Test delivery address with unit, city and state";
const estimate = (subtotal_sen: number, overrides = {}) =>
  deliveryQuote({
    fulfillment: "delivery",
    postcode: "50000",
    address,
    subtotal_sen,
    default_fee_sen: 500,
    areas,
    ...overrides,
  });
describe("Delivery estimates in integer sen", () => {
  it.each([
    [29999, 800, false],
    [30000, 0, true],
    [35000, 0, true],
  ])("quotes %i sen at the exact threshold", (subtotal, fee, free) => {
    const result = estimate(subtotal as number);
    expect(result.fee_sen).toBe(fee);
    expect(result.free).toBe(free);
  });
  it("subtracts product discounts, never counts shipping or tax, and updates when items are removed", () => {
    expect(estimate(35000, { discount_sen: 5001 }).fee_sen).toBe(800);
    expect(estimate(35000, { discount_sen: 5000 }).fee_sen).toBe(0);
    expect(estimate(29200).remaining_sen).toBe(800);
    expect(estimate(29999).fee_sen).toBe(800);
    expect(() => estimate(30000, { discount_sen: 30001 })).toThrow();
  });
  it("does not infer Klang Valley from a prefix, address text or an unconfigured postcode", () => {
    expect(estimate(35000, { postcode: "80000" }).fee_sen).toBe(1500);
    expect(estimate(35000, { postcode: "50100" }).fee_sen).toBe(500);
    expect(estimate(35000, { address: "" }).free).toBe(false);
    expect(estimate(35000, { postcode: "" }).free).toBe(false);
    expect(estimate(35000, { postcode_prefixes: ["80"] }).free).toBe(false);
    expect(estimate(35000, { areas: [] }).free).toBe(false);
  });
  it("always charges zero for pickup", () => {
    expect(
      estimate(100, { fulfillment: "pickup", postcode: "", address: "" })
        .fee_sen,
    ).toBe(0);
  });
  it("requires unique exact postcode lists and valid standard fees", () => {
    expect(deliveryAreasSchema.safeParse(areas).success).toBe(true);
    expect(
      deliveryAreasSchema.safeParse([{ ...areas[0], postcodes: ["50"] }])
        .success,
    ).toBe(false);
    expect(
      deliveryAreasSchema.safeParse([
        areas[0],
        { ...areas[1], postcodes: ["50000"] },
      ]).success,
    ).toBe(false);
    expect(
      deliveryAreasSchema.safeParse([{ ...areas[0], standard_fee_sen: -1 }])
        .success,
    ).toBe(false);
  });
});

let db: PGlite, product: string, oldToken: string;
const owner = "30000000-0000-0000-0000-000000000001";
const branch = "20000000-0000-0000-0000-000000000001";
const settings = {
  enabled: true,
  allow_pickup: true,
  allow_delivery: true,
  allow_cash_pickup: true,
  pickup_address: "Test collection address",
  contact_phone: "0100000000",
  delivery_fee_sen: 500,
  delivery_postcode_prefixes: [],
  delivery_note: "Test delivery instructions",
  bank_name: "Test Bank",
  bank_account_name: "Test Store",
  bank_account_number: "TEST-ONLY-ACCOUNT",
  duitnow_qr_url: "",
};
async function who(role: "authenticated" | "service_role" | "anon") {
  await db.exec(
    `reset role; select set_config('test.uid','${role === "authenticated" ? owner : ""}',false); set role ${role};`,
  );
}
async function rpc<T>(name: string, parameters: unknown[]) {
  const values = parameters.map((v) =>
    typeof v === "object" ? JSON.stringify(v) : v,
  );
  return (
    await db.query<{ result: T }>(
      `select ${name}(${parameters.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      values,
    )
  ).rows[0].result;
}
async function configure(extra = {}) {
  await who("authenticated");
  await rpc("manage_online_order", [
    "configure",
    { ...settings, delivery_areas: areas, ...extra },
  ]);
}
async function place(price: number, extra: Record<string, unknown> = {}) {
  await db.exec("reset role");
  await db.query("update products set price_sen=$1 where id=$2", [
    price,
    product,
  ]);
  await who("service_role");
  return rpc<{ token: string }>("place_online_order", [
    {
      key: crypto.randomUUID(),
      expected_total_sen: price,
      name: "Test only",
      phone: "0100000000",
      email: "",
      fulfillment: "delivery",
      address,
      postcode: "50000",
      notes: "",
      payment_method: "bank",
      website: "",
      items: [{ product_id: product, quantity: 1 }],
      ...extra,
    },
    (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", ""),
  ]);
}
async function status(token: string) {
  await who("service_role");
  return rpc<{
    subtotal_sen: number;
    delivery_fee_sen: number;
    standard_delivery_fee_sen: number;
    delivery_discount_sen: number;
    total_sen: number;
    tax_sen: number;
  }>("online_order_status", [token]);
}
beforeAll(async () => {
  db = new PGlite();
  const source = readFileSync("tests/database.test.ts", "utf8");
  await db.exec(source.match(/`(create role anon;[^`]+)`/)![1]);
  for (const name of [
    "001_core.sql",
    "002_voids.sql",
    "003_metadata.sql",
    "004_online_store.sql",
  ])
    await db.exec(
      readFileSync(`supabase/migrations/${name}`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Test owner','${branch}','owner');update inventory set quantity=100;`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
  await who("authenticated");
  await rpc("manage_online_order", ["configure", settings]);
  oldToken = (await place(35000, { expected_total_sen: 35500 })).token;
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/006_delivery_areas.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Authoritative PostgreSQL delivery pricing", () => {
  it("preserves existing fees and orders and starts without assumed eligible areas", async () => {
    expect((await status(oldToken)).delivery_fee_sen).toBe(500);
    expect((await status(oldToken)).standard_delivery_fee_sen).toBe(500);
    expect((await status(oldToken)).total_sen).toBe(35500);
    await who("anon");
    const catalogue = await rpc<{ store: { delivery_areas: DeliveryArea[] } }>(
      "shop_catalogue",
      [],
    );
    expect(catalogue.store.delivery_areas).toEqual([]);
    expect(catalogue.store).not.toHaveProperty("bank_account_number");
    await configure();
  });
  it("blocks ambiguous or broad postcode configuration in the database", async () => {
    await expect(
      configure({ delivery_areas: [{ ...areas[0], postcodes: ["50"] }] }),
    ).rejects.toThrow(/five-digit/);
    await expect(
      configure({
        delivery_areas: [areas[0], { ...areas[1], postcodes: ["50000"] }],
      }),
    ).rejects.toThrow(/only one area/);
    await expect(
      configure({ delivery_areas: [{ ...areas[0], standard_fee_sen: -1 }] }),
    ).rejects.toThrow(/fee/);
    await configure();
  });
  it("retains areas when an older settings request omits the new field", async () => {
    await who("authenticated");
    await rpc("manage_online_order", ["configure", settings]);
    await who("anon");
    const result = await rpc<{ store: { delivery_areas: DeliveryArea[] } }>(
      "shop_catalogue",
      [],
    );
    expect(result.store.delivery_areas).toEqual(areas);
  });
  it.each([
    [29999, 800],
    [30000, 0],
    [35000, 0],
  ])("independently charges the correct fee for %i sen", async (price, fee) => {
    const result = await status(
      (await place(price, { expected_total_sen: price + fee })).token,
    );
    expect(result.delivery_fee_sen).toBe(fee);
    expect(result.standard_delivery_fee_sen).toBe(800);
    expect(result.delivery_discount_sen).toBe(800 - fee);
    expect(result.total_sen).toBe(price + fee);
  });
  it("applies standard charges outside KV or for an unconfigured postcode and zero for pickup", async () => {
    expect(
      (
        await status(
          (await place(35000, { postcode: "80000", expected_total_sen: 36500 }))
            .token,
        )
      ).delivery_fee_sen,
    ).toBe(1500);
    expect(
      (
        await status(
          (await place(35000, { postcode: "50100", expected_total_sen: 35500 }))
            .token,
        )
      ).delivery_fee_sen,
    ).toBe(500);
    expect(
      (
        await status(
          (
            await place(100, {
              fulfillment: "pickup",
              postcode: "",
              address: "",
              payment_method: "cash",
            })
          ).token,
        )
      ).delivery_fee_sen,
    ).toBe(0);
  });
  it("uses the post-discount threshold and does not include delivery charges", async () => {
    await db.exec("reset role");
    const below = await rpc<{ fee_sen: number }>("shop_delivery_quote", [
      branch,
      "delivery",
      "50000",
      address,
      35000,
      5001,
    ]);
    const exact = await rpc<{ fee_sen: number }>("shop_delivery_quote", [
      branch,
      "delivery",
      "50000",
      address,
      35000,
      5000,
    ]);
    expect(below.fee_sen).toBe(800);
    expect(exact.fee_sen).toBe(0);
  });
  it("rejects manipulated totals, discounts, fake addresses and invalid postcodes", async () => {
    await expect(place(29999, { expected_total_sen: 29999 })).rejects.toThrow(
      /Prices/,
    );
    await expect(
      place(35000, { expected_total_sen: 35000, discount_sen: 10000 }),
    ).rejects.toThrow(/Client-supplied/);
    await expect(place(35000, { postcode: "50" })).rejects.toThrow(/postcode/);
    await expect(place(35000, { address: "x" })).rejects.toThrow(/address/);
    await configure({ delivery_postcode_prefixes: ["80"] });
    await expect(place(35000)).rejects.toThrow(/outside/);
    await configure();
  });
  it("calculates tax after shipping savings and keeps snapshots when admin charges change", async () => {
    await db.exec("reset role;update system_settings set tax_bps=600");
    const token = (await place(30000, { expected_total_sen: 31800 })).token;
    const receipt = await status(token);
    expect(receipt.tax_sen).toBe(1800);
    expect(receipt.total_sen).toBe(31800);
    await configure({ delivery_areas: [] });
    expect(await status(token)).toEqual(receipt);
    await configure();
  });
  it("records only the net shipping charge in paid sales and refunds", async () => {
    const token = (await place(30000, { expected_total_sen: 31800 })).token;
    await rpc("submit_online_payment", [token, "TEST-VERIFIED-PAYMENT"]);
    await db.exec("reset role");
    const order = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [token],
      )
    ).rows[0];
    await who("authenticated");
    await rpc("retail_action", ["open_session", { opening_sen: 0 }]);
    const sale = await rpc<string>("manage_online_order", [
      "confirm_payment",
      {
        id: order.id,
        verified: true,
        reference: "TEST-VERIFIED-PAYMENT",
        tendered_sen: 31800,
      },
    ]);
    expect(
      (
        await db.query<{ total_sen: number }>(
          "select total_sen from sales where id=$1",
          [sale],
        )
      ).rows[0].total_sen,
    ).toBe(31800);
    expect(
      (
        await db.query(
          "select * from sale_items where sale_id=$1 and product_id is null",
          [sale],
        )
      ).rows,
    ).toHaveLength(0);
    await rpc("void_sale", [
      {
        sale_id: sale,
        method: "bank",
        reason: "Test free delivery order refund",
        restock: true,
      },
    ]);
    expect(
      (
        await db.query<{ total: number }>(
          "select sum(total_sen)::int total from refunds where sale_id=$1",
          [sale],
        )
      ).rows[0].total,
    ).toBe(31800);
  });
  it("requires owner role to edit areas even through a direct database call", async () => {
    await db.exec("reset role");
    const manager = "30000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${manager}');insert into profiles(id,display_name,branch_id,role) values('${manager}','Test manager','${branch}','manager');select set_config('test.uid','${manager}',false);set role authenticated;`,
    );
    await expect(
      rpc("manage_online_order", [
        "configure",
        { ...settings, delivery_areas: areas },
      ]),
    ).rejects.toThrow();
  });
  it("does not expose private pricing/configuration functions to public or staff callers", async () => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await who(role);
      await expect(
        db.query(
          "select shop_delivery_quote($1,'delivery','50000',$2,35000,0)",
          [branch, address],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          "select manage_online_order_before_delivery('configure','{}')",
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select shop_catalogue_before_delivery()"),
      ).rejects.toThrow(/permission denied/);
    }
  });
});
