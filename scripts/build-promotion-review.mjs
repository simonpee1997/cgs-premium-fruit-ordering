// Generates review artifacts only. No database connection or deployment occurs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = "supabase/review";
mkdirSync(dir, { recursive: true });
const baseline = JSON.parse(
  readFileSync(`${dir}/baseline-001-007.json`, "utf8"),
);
const manifest = JSON.stringify(baseline);
const guard = `do $schema_preflight$
declare expected jsonb := $expected_schema$${manifest}$expected_schema$::jsonb;
 entry jsonb; actual record; target oid; expected_settings text[];
begin
 if to_regclass('public.businesses') is null or not exists(select 1 from public.businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then raise exception 'STOP: This is not CHIPSTI POS';end if;
 if not exists(select 1 from public.branches where id='20000000-0000-0000-0000-000000000001' and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'STOP: CHIPSTI branch/business mismatch';end if;
 if to_regclass('public.promotion_redemptions') is not null or exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotions' and column_name='code') then raise exception 'STOP: 008/009 is already or partly installed. Do not replay this fresh-install bundle; inspect/export the schema first.';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'STOP: Unsafe public schema CREATE privileges';end if;
 for entry in select value from jsonb_array_elements(expected->'columns') loop
  select format_type(a.atttypid,a.atttypmod) as data_type,a.attnotnull as not_null,c.relrowsecurity as rls into actual from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid where c.oid=to_regclass('public.'||(entry->>'table_name')) and a.attname=entry->>'column_name' and a.attnum>0 and not a.attisdropped;
  if not found or actual.data_type is distinct from entry->>'data_type' or actual.not_null is distinct from (entry->>'not_null')::boolean or not actual.rls then raise exception 'STOP: Schema differs from migrations 001-007 at %.%. Review an actual schema export.',entry->>'table_name',entry->>'column_name';end if;
 end loop;
 for entry in select value from jsonb_array_elements(expected->'functions') loop
  target:=to_regprocedure('public.'||(entry->>'signature'));
  select md5(p.prosrc) as source_md5,p.prosecdef,format_type(p.prorettype,null) as return_type,p.proconfig,p.proowner into actual from pg_catalog.pg_proc p where p.oid=target;
  expected_settings:=array(select jsonb_array_elements_text(entry->'settings'));
  if not found or actual.source_md5 is distinct from entry->>'source_md5' or actual.prosecdef is distinct from (entry->>'security_definer')::boolean or actual.return_type is distinct from entry->>'return_type' or actual.proconfig is distinct from expected_settings then raise exception 'STOP: Existing function % differs from the reviewed 001-007 baseline. Preserve/export it before reviewing a target-specific migration.',entry->>'signature';end if;
  if actual.proowner in(select oid from pg_catalog.pg_roles where rolname in('anon','authenticated','service_role')) then raise exception 'STOP: Unsafe owner for existing SECURITY DEFINER function';end if;
 end loop;
 for entry in select value from jsonb_array_elements(expected->'policies') loop
  select p.polcmd,pg_get_expr(p.polqual,p.polrelid) as expression,p.polroles into actual from pg_catalog.pg_policy p where p.polrelid=to_regclass('public.'||(entry->>'table_name')) and p.polname=entry->>'polname';
  if not found or actual.polcmd::text is distinct from entry->>'polcmd' or regexp_replace(actual.expression,'[\\s()]','','g') is distinct from regexp_replace(entry->>'expression','[\\s()]','','g') or actual.polroles is distinct from array[(select oid from pg_catalog.pg_roles where rolname='authenticated')] then raise exception 'STOP: Policy % differs from the reviewed baseline',entry->>'polname';end if;
  if (select count(*) from pg_catalog.pg_policy where polrelid=to_regclass('public.'||(entry->>'table_name')))<>1 then raise exception 'STOP: Additional policies on % require review',entry->>'table_name';end if;
 end loop;
end
$schema_preflight$;
`;
const header =
  "-- CHIPSTI PROMOTION RELEASE REVIEW v2 — NOT APPROVED FOR EXECUTION\n-- Target: CHIPSTI POS xmbusapgcxtmdjvnbdgs through migrations 001–007 only.\n-- Fresh install only. No automatic campaign publication.\n";
const preflight =
  header +
  "-- READ-ONLY PREFLIGHT. Do not run on production before explicit approval.\nbegin transaction read only;\n" +
  guard +
  "select 'Baseline preflight passed; no changes made' as result;\nrollback;\n-- END CHIPSTI READ-ONLY PREFLIGHT v2\n";
writeFileSync(`${dir}/schema-preflight.sql`, preflight);
const migrations = [
  "008_promotion_management.sql",
  "009_promotion_checkout.sql",
];
const body = migrations
  .map((name) => {
    const text = readFileSync("supabase/migrations/" + name, "utf8").trim();
    if (!text.startsWith("begin;") || !text.endsWith("commit;"))
      throw Error("Missing transaction boundary: " + name);
    return (
      "-- BEGIN " + name + "\n" + text.slice(6, -7).trim() + "\n-- END " + name
    );
  })
  .join("\n\n");
const sql =
  header +
  "begin;\nset local lock_timeout='5s';\nset local statement_timeout='120s';\nselect pg_advisory_xact_lock(hashtextextended('chipsti-promotion-reviewed-v2',0));\n" +
  guard +
  "\n" +
  body +
  "\nselect 'CHIPSTI promotion schema installed; CGSVIP20 remains DRAFT' as result;\ncommit;\n-- END CHIPSTI REVIEWED PROMOTION RELEASE v2 — COMPLETE FILE\n";
// Count each named tag. PostgreSQL development tests validate the real grammar.
const tags = [...sql.matchAll(/\$[A-Za-z_][A-Za-z_0-9]*\$/g)].map((m) => m[0]);
for (const tag of new Set(tags))
  if (tags.filter((t) => t === tag).length !== 2)
    throw Error("Unbalanced named dollar quote: " + tag);
writeFileSync(`${dir}/promotion-release-reviewed.sql`, sql);
const activation =
  header.replace(
    "-- Target: CHIPSTI POS xmbusapgcxtmdjvnbdgs through migrations 001–007 only.\n-- Fresh install only. No automatic campaign publication.",
    "-- Target: CHIPSTI POS xmbusapgcxtmdjvnbdgs with the reviewed promotion schema installed.\n-- Separate campaign publication approval required.",
  ) +
  `-- SEPARATE APPROVAL REQUIRED. Not part of the schema migration.\nbegin;\nset local lock_timeout='5s';\ndo $activate_cgsvip20$\ndeclare p public.promotions;\nbegin\n if not exists(select 1 from public.businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') or not exists(select 1 from public.branches where id='20000000-0000-0000-0000-000000000001' and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'STOP: Activation target is not CHIPSTI POS';end if;\n select * into strict p from public.promotions where code='CGSVIP20' for update;\n if p.branch_id<>'20000000-0000-0000-0000-000000000001'::uuid or p.name<>'Cili Gemuk Selayang Customer Special' or p.discount_type<>'percent' or p.percent_bps<>2000 or p.fixed_discount_sen<>0 or p.starts_at<>'2026-11-06 00:00:00+08'::timestamptz or p.ends_at<>'2026-11-30 23:59:59.999999+08'::timestamptz or p.minimum_spend_sen<>0 or p.discount_cap_sen is not null or p.max_redemptions is not null or cardinality(p.eligible_product_ids||p.eligible_category_ids||p.excluded_product_ids||p.excluded_category_ids)<>0 or p.allow_manual_stacking or p.active then raise exception 'STOP: CGSVIP20 configuration does not match the reviewed offer';end if;\n if p.ends_at<clock_timestamp() or p.publication_status not in ('draft','published') then raise exception 'STOP: Do not reactivate an ended, paused or expired campaign';end if;\n if p.publication_status='draft' then update public.promotions set publication_status='published' where id=p.id;end if;\nend\n$activate_cgsvip20$;\ncommit;\n-- END SEPARATE CGSVIP20 ACTIVATION — DO NOT RUN WITHOUT APPROVAL\n`;
writeFileSync(`${dir}/activate-cgsvip20-after-approval.sql`, activation);
const files = [
  "promotion-release-reviewed.sql",
  "schema-preflight.sql",
  "activate-cgsvip20-after-approval.sql",
  "baseline-001-007.json",
];
const checksums =
  files
    .map(
      (name) =>
        createHash("sha256")
          .update(readFileSync(`${dir}/${name}`))
          .digest("hex") +
        "  " +
        name,
    )
    .join("\n") + "\n";
writeFileSync(`${dir}/SHA256SUMS`, checksums);
console.log(
  JSON.stringify({
    reviewOnly: true,
    sqlLines: sql.trimEnd().split("\n").length,
    sqlBytes: Buffer.byteLength(sql),
    namedDollarBlocks: new Set(tags).size,
    files,
  }),
);
