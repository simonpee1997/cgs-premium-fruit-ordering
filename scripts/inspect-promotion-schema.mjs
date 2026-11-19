// Explicitly approved production deployment only; normal builds do nothing.
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const sha = process.env.CHIPSTI_PROMOTION_INSPECT_SHA;
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
  // Use the same root CA download configured by Supabase's official Studio:
  // https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
  const caResponse = await fetch(
    "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt",
    { signal: AbortSignal.timeout(20000) },
  );
  if (!caResponse.ok)
    throw new Error("Official database CA download failed; no changes made");
  const ca = await caResponse.text();
  const certificate = new X509Certificate(ca);
  if (!certificate.ca || Date.parse(certificate.validTo) <= Date.now())
    throw new Error(
      "Official database CA is invalid or expired; no changes made",
    );
  // URI ssl flags override pg's explicit TLS object, so remove them and require
  // authenticated TLS with the official CA plus the normal trusted root set.
  for (const name of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey"])
    target.searchParams.delete(name);
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
    ssl: {
      rejectUnauthorized: true,
      ca: [...rootCertificates, ca],
      servername: target.hostname,
    },
    connectionTimeoutMillis: 20000,
    statement_timeout: 45000,
    query_timeout: 60000,
  });
  try {
    await client.connect();
    await client.query("begin read only");
    const functions = (await client.query("select p.oid::regprocedure::text signature,md5(p.prosrc) source_md5,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('checkout','manage_online_order_before_delivery','place_online_order','quote_online_order','online_order_status','shop_delivery_quote','retail_action','shop_catalogue') order by 1")).rows;
    const columns = (await client.query("select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
    const guards = (await client.query("select exists(select 1 from businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE') chipsti, to_regclass('public.promotion_redemptions') promotions, has_schema_privilege('anon','public','CREATE') anon_create,has_schema_privilege('authenticated','public','CREATE') staff_create")).rows;
    await client.query("rollback");
    console.log("CHIPSTI_SCHEMA_INSPECT "+Buffer.from(JSON.stringify({functions,columns,guards})).toString('base64'));

  } catch (e) {
    console.error("CHIPSTI schema inspection failed: " + (e.code || e.message));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
