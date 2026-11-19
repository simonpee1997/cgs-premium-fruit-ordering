// Explicitly approved production deployment only; normal builds do nothing.
import { pathToFileURL } from "node:url";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const sha = process.env.CHIPSTI_PROMOTION_RELEASE_SHA;
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
    statement_timeout: 120000,
    query_timeout: 130000,
  });
  try {
    await client.connect();
    const version = "CHIPSTI bilingual POS promotion release 20261119 v1";
    const current = (
      await client.query(
        "select obj_description('public.checkout(jsonb)'::regprocedure,'pg_proc') version",
      )
    ).rows[0].version;
    if (current !== version)
      await client.query(
        await readFile(
          new URL(
            "../supabase/releases/20261119-bilingual-pos-promotions.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
    const campaign = (
      await client.query(
        "select code,percent_bps,minimum_spend_sen,publication_status,ends_at from promotions where code='CGSVIP20' and branch_id='20000000-0000-0000-0000-000000000001'",
      )
    ).rows[0];
    if (
      campaign?.percent_bps !== 2000 ||
      Number(campaign.minimum_spend_sen) !== 0 ||
      campaign.publication_status !== "published" ||
      campaign.ends_at.toISOString() !== "2026-12-31T15:59:59.999Z"
    )
      throw new Error("Campaign configuration verification failed");
    const product = (
      await client.query(
        "select id,price_sen from products where not archived and price_sen>0 order by sku limit 1",
      )
    ).rows[0];
    const quote = (
      await client.query(
        "select public.shop_promotion_quote('CGSVIP20',$1::jsonb) quote",
        [JSON.stringify([{ product_id: product.id, quantity: 1 }])],
      )
    ).rows[0].quote;
    if (
      quote.discount_sen !==
      Math.floor((Number(product.price_sen) * 2000 + 5000) / 10000)
    )
      throw new Error("Server 20 percent quote verification failed");
    console.log(
      "CHIPSTI_PROMOTION_RELEASE " +
        JSON.stringify({
          applied: current !== version,
          version,
          code: campaign.code,
          percent: 20,
          expiry_malaysia: "2026-12-31 23:59:59",
          server_quote_verified: true,
          existing_accounting_unchanged: true,
        }),
    );
  } catch (e) {
    console.error("CHIPSTI promotion release failed: " + (e.code || e.message));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
