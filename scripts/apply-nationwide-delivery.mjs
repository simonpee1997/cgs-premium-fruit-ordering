// Explicitly approved production deployment only; normal builds do nothing.
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import pg from "pg";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const sha = process.env.CHIPSTI_NATIONWIDE_DELIVERY_SHA;
  if (!sha) process.exit(0);
  if (
    process.env.VERCEL_ENV !== "production" ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    sha !== process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !==
      "https://xmbusapgcxtmdjvnbdgs.supabase.co"
  )
    throw new Error("Explicit CHIPSTI production commit approval required");
  const connectionString =
    process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString)
    throw new Error("CHIPSTI database integration unavailable");
  const target = new URL(connectionString);
  if (
    !target.hostname.endsWith(".supabase.co") &&
    !target.hostname.endsWith(".pooler.supabase.com")
  )
    throw new Error("Unrecognized database host; no changes made");
  target.searchParams.set("sslmode", "verify-full");
  if (
    ![target.hostname, decodeURIComponent(target.username)].some((v) =>
      v.includes("xmbusapgcxtmdjvnbdgs"),
    )
  )
    throw new Error(
      "Database integration belongs to another project; no changes made",
    );
  const client = new pg.Client({
    connectionString: target.toString(),
    connectionTimeoutMillis: 20000,
    statement_timeout: 45000,
    query_timeout: 60000,
  });
  try {
    await client.connect();
    const before = await client.query(
      "select s.branch_id,s.delivery_fee_sen,s.delivery_areas,s.allow_delivery,s.allow_pickup from public.online_store_settings s join public.branches b on b.id=s.branch_id join public.businesses x on x.id=b.business_id where s.branch_id=$1 and x.name='CHIPSTI ENTERPRISE' and x.ssm='202603232290 (RA0139100-V)'",
      ["20000000-0000-0000-0000-000000000001"],
    );
    if (before.rows.length !== 1 || !before.rows[0].allow_delivery)
      throw new Error("CHIPSTI delivery configuration verification failed");
    const installed = await client.query(
      "select obj_description('public.shop_delivery_quote(uuid,text,text,text,bigint,bigint)'::regprocedure,'pg_proc') as version",
    );
    if (installed.rows[0].version !== "CHIPSTI nationwide free delivery v1")
      await client.query(
        await readFile(
          new URL(
            "../supabase/migrations/008_nationwide_delivery.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
    const after = await client.query(
      "select branch_id,delivery_fee_sen,delivery_areas,allow_delivery,allow_pickup,delivery_postcode_prefixes from public.online_store_settings where branch_id=$1",
      [before.rows[0].branch_id],
    );
    if (
      after.rows.length !== 1 ||
      after.rows[0].delivery_postcode_prefixes.length !== 0 ||
      Object.keys(before.rows[0]).some(
        (k) =>
          JSON.stringify(after.rows[0][k]) !==
          JSON.stringify(before.rows[0][k]),
      )
    )
      throw new Error("Nationwide delivery settings verification failed");
    for (const postcode of ["01000", "50000", "80000", "88000", "93000"])
      for (const subtotal of [29999, 30000]) {
        const q = await client.query(
          "select public.shop_delivery_quote($1,'delivery',$2,'Read-only verification address',$3::bigint,0::bigint) as quote",
          [before.rows[0].branch_id, postcode, subtotal],
        );
        const quote = q.rows[0].quote;
        if (
          subtotal === 30000
            ? quote.fee_sen !== 0
            : quote.fee_sen !== quote.standard_fee_sen
        )
          throw new Error("Nationwide delivery boundary verification failed");
      }
    console.log(
      "CHIPSTI_NATIONWIDE_DELIVERY " +
        JSON.stringify({
          applied: true,
          postcodes_unrestricted: true,
          threshold_sen: 30000,
          default_fee_unchanged: true,
          existing_orders_unchanged: true,
          server_quotes_verified: true,
        }),
    );
  } catch (e) {
    console.error("CHIPSTI nationwide update failed: " + (e.code || e.message));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
