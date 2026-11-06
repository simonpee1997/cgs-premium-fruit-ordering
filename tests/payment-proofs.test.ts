import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateProofFile, MAX_PROOF_BYTES } from "../src/lib/payment-proof";
import { prepareProofSchema } from "../src/lib/payment-proof-validation";
import { onlineOrderSchema } from "../src/lib/shop-validation";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/f9sAAAAASUVORK5CYII=",
  "base64",
);
describe("Original branding and receipt content validation", () => {
  it("retains both supplied JPEGs byte-for-byte and derives correctly sized mascot icons", () => {
    const sources = JSON.parse(
      readFileSync("public/branding/source-files.json", "utf8"),
    );
    for (const source of sources)
      expect(
        createHash("sha256")
          .update(readFileSync("public/branding/" + source.asset))
          .digest("hex"),
      ).toBe(source.sha256);
    expect(
      sources.map((s: { original_filename: string }) => s.original_filename),
    ).toContain("WhatsApp Image 2026-11-06 at 7.40.19 PM.jpeg");
    for (const size of [192, 512]) {
      const b = readFileSync(`public/icon-${size}.png`);
      expect(b.readUInt32BE(16)).toBe(size);
      expect(b.readUInt32BE(20)).toBe(size);
    }
  });
  it("accepts supported file types including exactly 5 MB and rejects disguised/truncated content", () => {
    expect(
      validateProofFile(
        { name: "receipt.PNG", type: "image/png", size: png.length },
        png,
      ),
    ).toBe("image/png");
    const pdf = Buffer.alloc(MAX_PROOF_BYTES, 32);
    pdf.write("%PDF-1.4\n");
    pdf.write("%%EOF", pdf.length - 5);
    expect(
      validateProofFile(
        { name: "receipt.pdf", type: "application/pdf", size: pdf.length },
        pdf,
      ),
    ).toBe("application/pdf");
    expect(() =>
      validateProofFile({
        name: "x.pdf",
        type: "application/pdf",
        size: MAX_PROOF_BYTES + 1,
      }),
    ).toThrow(/5 MB/);
    expect(() =>
      validateProofFile(
        { name: "x.exe", type: "image/png", size: png.length },
        png,
      ),
    ).toThrow();
    expect(() =>
      validateProofFile(
        { name: "x.png", type: "image/jpeg", size: png.length },
        png,
      ),
    ).toThrow();
    expect(() =>
      validateProofFile(
        { name: "x.png", type: "image/png", size: 10 },
        Buffer.from("<script>"),
      ),
    ).toThrow(/content/);
    expect(() =>
      validateProofFile(
        { name: "x.png", type: "image/png", size: png.length },
        png.subarray(0, 20),
      ),
    ).toThrow(/content/);
    expect(
      prepareProofSchema.safeParse({
        key: crypto.randomUUID(),
        filename: "x.pdf",
        mime_type: "application/pdf",
        byte_size: MAX_PROOF_BYTES + 1,
        sha256: "a".repeat(64),
        total_sen: 1800,
      }).success,
    ).toBe(false);
  });
});
let db: PGlite, product: string, legacyToken: string;
const owner = "30000000-0000-0000-0000-000000000001",
  cashier = "30000000-0000-0000-0000-000000000002",
  branch = "20000000-0000-0000-0000-000000000001";
const bucket = "b".repeat(64);
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
  bank_account_number: "TEST-ACCOUNT",
  duitnow_qr_url: "https://legacy.invalid/qr.png",
};
async function who(role = "service_role", id = owner) {
  await db.exec(
    `reset role; select set_config('test.uid','${role === "authenticated" ? id : ""}',false);set role ${role};`,
  );
}
async function rpc<T = unknown>(name: string, parameters: unknown[]) {
  return (
    await db.query<{ result: T }>(
      `select ${name}(${parameters.map((v, i) => `$${i + 1}${typeof v === "object" ? "::jsonb" : ""}`).join(",")}) result`,
      parameters.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
const order = (extra: Record<string, unknown> = {}) => ({
  key: crypto.randomUUID(),
  expected_total_sen: 1800,
  name: "Test customer",
  phone: "0100000000",
  email: "",
  fulfillment: "pickup",
  address: "",
  postcode: "",
  notes: "Test only",
  payment_method: "duitnow",
  website: "",
  items: [{ product_id: product, quantity: 1 }],
  ...extra,
});
type Proof = { id: string; token: string; path: string; ready: boolean };
async function stage(extra = {}) {
  await who();
  return rpc<Proof>("prepare_payment_proof", [
    {
      key: crypto.randomUUID(),
      filename: "test-receipt.png",
      mime_type: "image/png",
      byte_size: png.length,
      sha256: createHash("sha256").update(crypto.randomUUID()).digest("hex"),
      total_sen: 1800,
      ...extra,
    },
    bucket,
  ]);
}
async function ready(extra = {}) {
  const p = await stage(extra);
  await rpc("complete_payment_proof", [p.id, p.token, true]);
  return p;
}
async function place(payload: object) {
  await who();
  return rpc<{ token: string; order_number: string }>("place_online_order", [
    payload,
    bucket,
  ]);
}
async function state(token: string) {
  await who();
  return rpc<{
    status: string;
    payment_proof_received: boolean;
    payment_reference: string;
    store: { duitnow_qr_url: string };
  }>("online_order_status", [token]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    readFileSync("tests/database.test.ts", "utf8").match(
      /`(create role anon;[^`]+)`/,
    )![1],
  );
  for (const n of [
    "001_core.sql",
    "002_voids.sql",
    "003_metadata.sql",
    "004_online_store.sql",
    "006_delivery_areas.sql",
  ])
    await db.exec(
      readFileSync("supabase/migrations/" + n, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values('${owner}'),('${cashier}');insert into profiles(id,display_name,branch_id,role) values('${owner}','Test owner','${branch}','owner'),('${cashier}','Test cashier','${branch}','cashier');update inventory set quantity=100;`,
  );
  product = (
    await db.query<{ id: string }>("select id from products where sku='LF-02'")
  ).rows[0].id;
  await who("authenticated");
  await rpc("manage_online_order", ["configure", settings]);
  legacyToken = (await place(order())).token;
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/007_payment_proofs.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Private proof and QR order PostgreSQL boundaries", () => {
  it("creates a private, restricted bucket and preserves legacy order records", async () => {
    await db.exec("reset role");
    const row = (
      await db.query<{ public: boolean; file_size_limit: number }>(
        "select public,file_size_limit from storage.buckets where id='payment-proofs'",
      )
    ).rows[0];
    expect(row.public).toBe(false);
    expect(row.file_size_limit).toBe(MAX_PROOF_BYTES);
    expect((await state(legacyToken)).status).toBe("awaiting_payment");
    expect((await state(legacyToken)).payment_proof_received).toBe(false);
  });
  it("keeps Storage objects private even if an unrelated broad read policy exists", async () => {
    await db.exec(
      "reset role;grant usage on schema storage to anon,authenticated;grant select on storage.objects to anon,authenticated;create policy test_other_bucket_read on storage.objects for select to anon,authenticated using(true);insert into storage.objects values(gen_random_uuid(),'payment-proofs'),(gen_random_uuid(),'product-images');",
    );
    for (const role of ["anon", "authenticated"]) {
      await who(role);
      expect(
        (
          await db.query(
            "select * from storage.objects where bucket_id='payment-proofs'",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "select * from storage.objects where bucket_id='product-images'",
          )
        ).rows,
      ).toHaveLength(1);
    }
  });
  it("exposes the QR method but never proof paths/tokens or bank credentials in the catalogue", async () => {
    await who("anon");
    const data = await rpc<{ store: Record<string, unknown> }>(
      "shop_catalogue",
      [],
    );
    expect(data.store.duitnow_available).toBe(true);
    expect(data.store).not.toHaveProperty("bank_account_number");
    expect(JSON.stringify(data)).not.toContain("claim_token");
  });
  it("independently quotes stock, exact prices, tax and configured free delivery", async () => {
    await who("authenticated");
    await rpc("manage_online_order", [
      "configure",
      {
        ...settings,
        delivery_areas: [
          {
            id: crypto.randomUUID(),
            name: "Test KV",
            postcodes: ["50000"],
            standard_fee_sen: 800,
            free_delivery_eligible: true,
          },
        ],
      },
    ]);
    await db.exec(
      "reset role;update products set price_sen=30000 where sku='LF-02';update system_settings set tax_bps=600",
    );
    await who();
    const quote = await rpc<{ total_sen: number; fee_sen: number }>(
      "quote_online_order",
      [
        {
          items: [{ product_id: product, quantity: 1 }],
          fulfillment: "delivery",
          address: "Test complete delivery address",
          postcode: "50000",
        },
      ],
    );
    expect(quote.total_sen).toBe(31800);
    expect(quote.fee_sen).toBe(0);
    await db.exec(
      "reset role;update products set price_sen=1800 where sku='LF-02';update system_settings set tax_bps=0",
    );
  });
  it("requires proof in API schema and database, and leaves existing cash/bank methods working", async () => {
    expect(onlineOrderSchema.safeParse(order()).success).toBe(false);
    await expect(place(order())).rejects.toThrow(/proof/);
    expect((await place(order({ payment_method: "cash" }))).token).toBeTruthy();
    expect((await place(order({ payment_method: "bank" }))).token).toBeTruthy();
  });
  it("supports idempotent upload preparation but rejects changed metadata under the same key", async () => {
    const key = crypto.randomUUID();
    const p = await stage({ key });
    await db.exec("reset role");
    const row = (
      await db.query<{ sha256: string }>(
        "select sha256 from payment_proofs where id=$1",
        [p.id],
      )
    ).rows[0];
    expect(await stage({ key, sha256: row.sha256 })).toEqual(p);
    await expect(stage({ key })).rejects.toThrow(/new receipt upload/);
  });
  it("rejects unfinished, expired, forged-token or wrong-amount proofs", async () => {
    const p = await stage();
    await expect(
      place(order({ proof_id: p.id, proof_token: p.token })),
    ).rejects.toThrow(/proof/);
    await rpc("complete_payment_proof", [p.id, p.token, true]);
    await expect(
      place(order({ proof_id: p.id, proof_token: crypto.randomUUID() })),
    ).rejects.toThrow(/proof/);
    const wrong = await ready({ total_sen: 2000 });
    await expect(
      place(order({ proof_id: wrong.id, proof_token: wrong.token })),
    ).rejects.toThrow(/different order amount/);
    await db.exec("reset role");
    await db.query(
      "update payment_proofs set expires_at=now()-interval '1 minute' where id=$1",
      [p.id],
    );
    await expect(
      place(order({ proof_id: p.id, proof_token: p.token })),
    ).rejects.toThrow(/proof/);
  });
  it("links a validated receipt atomically, remains pending, and returns the same order on retry", async () => {
    const p = await ready();
    const payload = order({ proof_id: p.id, proof_token: p.token });
    const placed = await place(payload);
    expect(await place(payload)).toEqual(placed);
    const status = await state(placed.token);
    expect(status.status).toBe("payment_submitted");
    expect(status.payment_proof_received).toBe(true);
    expect(status.store.duitnow_qr_url).toBe(
      "https://chipsti.com/branding/chipsti-duitnow.original.jpeg",
    );
    expect(status).not.toHaveProperty("proof_token");
    expect(status).not.toHaveProperty("object_path");
    await db.exec("reset role");
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
    const oid = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [placed.token],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ order_id: string }>(
          "select order_id from payment_proofs where id=$1",
          [p.id],
        )
      ).rows[0].order_id,
    ).toBe(oid);
    await expect(
      place(order({ proof_id: p.id, proof_token: p.token })),
    ).rejects.toThrow(/proof/);
    await who("authenticated");
    const meta = await rpc<Record<string, unknown>>("staff_payment_proof", [
      oid,
    ]);
    expect(meta.filename).toBe("test-receipt.png");
    expect(meta).not.toHaveProperty("claim_token");
    await who("authenticated", cashier);
    await expect(rpc("staff_payment_proof", [oid])).rejects.toThrow();
    await expect(
      rpc("manage_online_order", [
        "confirm_payment",
        {
          id: oid,
          verified: true,
          reference: "TEST-REFERENCE",
          tendered_sen: 1800,
        },
      ]),
    ).rejects.toThrow();
    await who("authenticated");
    await rpc("retail_action", ["open_session", { opening_sen: 0 }]);
    await expect(
      rpc("manage_online_order", [
        "confirm_payment",
        {
          id: oid,
          verified: false,
          reference: "TEST-REFERENCE",
          tendered_sen: 1800,
        },
      ]),
    ).rejects.toThrow(/verified/);
    const paid = await rpc<string>("manage_online_order", [
      "confirm_payment",
      {
        id: oid,
        verified: true,
        reference: "TEST-REFERENCE",
        tendered_sen: 1800,
      },
    ]);
    expect(paid).toBeTruthy();
    expect(
      await rpc("manage_online_order", [
        "confirm_payment",
        {
          id: oid,
          verified: true,
          reference: "TEST-REFERENCE",
          tendered_sen: 1800,
        },
      ]),
    ).toBe(paid);
  });
  it("keeps proof downloads scoped to the authorized staff branch", async () => {
    const p = await ready();
    const placed = await place(order({ proof_id: p.id, proof_token: p.token }));
    await db.exec("reset role");
    const oid = (
      await db.query<{ id: string }>(
        "select id from online_orders where tracking_token=$1",
        [placed.token],
      )
    ).rows[0].id;
    const other = "30000000-0000-4000-8000-000000000003",
      otherBranch = "20000000-0000-4000-8000-000000000002";
    await db.exec(
      `insert into branches values('${otherBranch}','10000000-0000-0000-0000-000000000001','Other test branch');insert into auth.users values('${other}');insert into profiles(id,display_name,branch_id,role) values('${other}','Other manager','${otherBranch}','manager');`,
    );
    await who("authenticated", other);
    expect(await rpc("staff_payment_proof", [oid])).toBeNull();
  });
  it("prevents reuse of identical receipt bytes for a second order", async () => {
    const sha = "c".repeat(64),
      one = await ready({ sha256: sha });
    await place(order({ proof_id: one.id, proof_token: one.token }));
    const two = await ready({ sha256: sha });
    await expect(
      place(order({ proof_id: two.id, proof_token: two.token })),
    ).rejects.toThrow(/unique|duplicate/);
  });
  it("allows legacy QR orders to submit a mandatory proof while preserving bank references", async () => {
    await who();
    await expect(
      rpc("submit_online_payment", [legacyToken, "TEST-OLD"]),
    ).rejects.toThrow(/proof/);
    const p = await ready();
    await rpc("submit_online_payment", [
      legacyToken,
      "TEST-OLD",
      p.id,
      p.token,
    ]);
    expect((await state(legacyToken)).payment_proof_received).toBe(true);
    const bank = await place(order({ payment_method: "bank" }));
    await rpc("submit_online_payment", [bank.token, "TEST-BANK"]);
    expect((await state(bank.token)).status).toBe("payment_submitted");
  });
  it("denies proof table reads, upload completion and private helper access to browser roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      await who(role);
      await expect(db.query("select * from payment_proofs")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        rpc("complete_payment_proof", [
          crypto.randomUUID(),
          crypto.randomUUID(),
          true,
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(rpc("prepare_payment_proof", [{}, bucket])).rejects.toThrow(
        /permission denied/,
      );
      await expect(rpc("quote_online_order", [{}])).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.query("select shop_catalogue_before_proofs()"),
      ).rejects.toThrow(/permission denied/);
    }
  });
});
