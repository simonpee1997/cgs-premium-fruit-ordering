// Reproducible SQL generation only. No remote connections.
import { readFileSync, writeFileSync } from "node:fs";
const expected = JSON.stringify(
  JSON.parse(
    readFileSync("supabase/releases/promotion-target-schema.json", "utf8"),
  ),
);
const guard = `do $current_schema_guard$
declare expected jsonb:=$expected$${expected}$expected$::jsonb;entry jsonb;actual record;
begin
 if not exists(select 1 from businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then raise exception 'Wrong business';end if;
 if not exists(select 1 from branches where id='20000000-0000-0000-0000-000000000001' and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'Wrong branch';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'Unsafe schema CREATE grants';end if;
 for entry in select value from jsonb_array_elements(expected->'functions') loop
  select md5(prosrc) hash,prosecdef,proconfig,proowner into actual from pg_proc where oid=to_regprocedure('public.'||(entry->>'signature'));
  if not found or actual.hash is distinct from entry->>'source_md5' or not actual.prosecdef or actual.proconfig is distinct from array['search_path=public, pg_temp'] or actual.proowner in(select oid from pg_roles where rolname in('anon','authenticated','service_role')) then raise exception 'Function drift: %; no migration applied',entry->>'signature';end if;
 end loop;
 for entry in select value from jsonb_array_elements(expected->'columns') loop
  select data_type,is_nullable into actual from information_schema.columns where table_schema='public' and table_name=entry->>'table_name' and column_name=entry->>'column_name';
  if not found or actual.data_type is distinct from entry->>'data_type' or actual.is_nullable is distinct from entry->>'is_nullable' then raise exception 'Column drift: %.%',entry->>'table_name',entry->>'column_name';end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass('public.'||(entry->>'table_name'))) then raise exception 'RLS missing: %',entry->>'table_name';end if;
 end loop;
 if to_regclass('public.promotion_redemptions') is not null or exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotions' and column_name='code') then raise exception 'Code migration already or partially installed; inspect before proceeding';end if;
end $current_schema_guard$;`;
const backup = `
create schema if not exists chipsti_release_backup;
revoke all on schema chipsti_release_backup from public,anon,authenticated,service_role;
create table chipsti_release_backup.promotion_release_20261119_functions as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl privileges from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('checkout','manage_online_order_before_delivery','place_online_order','quote_online_order','online_order_status','shop_delivery_quote','retail_action','shop_catalogue');
create table chipsti_release_backup.promotion_release_20261119_policies as select * from pg_policies where schemaname='public' and tablename in('promotions','audit_logs');
create table chipsti_release_backup.promotion_release_20261119_existing_offers as table promotions;
revoke all on all tables in schema chipsti_release_backup from public,anon,authenticated,service_role;
`;
const immutableTables = [
  "sales",
  "sale_items",
  "payments",
  "refunds",
  "refund_items",
  "online_orders",
  "online_order_items",
  "inventory",
  "products",
  "customers",
];
const ignored = {
  sales: ["promo_code", "promotion_discount_sen", "promotion_snapshot"],
  sale_items: ["english_name"],
  online_orders: ["promo_code", "promotion_discount_sen", "promotion_snapshot"],
  online_order_items: ["english_name", "promotion_discount_sen"],
};
const hashQuery = (table) =>
  `select md5(coalesce(string_agg(md5((to_jsonb(t)-array[${(ignored[table] || []).map((c) => "'" + c + "'").join(",")}]::text[])::text),'' order by md5((to_jsonb(t)-array[${(ignored[table] || []).map((c) => "'" + c + "'").join(",")}]::text[])::text)),'')) from public.${table} t`;
const lockAndHash =
  `lock table ${immutableTables.join(",")},promotions in share row exclusive mode;
create temporary table release_accounting_hashes(table_name text primary key,digest text) on commit drop;
` +
  immutableTables
    .map(
      (t) =>
        `insert into release_accounting_hashes values('${t}',(${hashQuery(t)}));`,
    )
    .join("\n");
const verifyHashes = immutableTables
  .map(
    (t) =>
      `do $verify_history$begin if (${hashQuery(t)}) is distinct from (select digest from release_accounting_hashes where table_name='${t}') then raise exception 'Existing ${t} changed; rolling back release';end if;end $verify_history$;`,
  )
  .join("\n");
const files = [
  "009_promotion_management",
  "010_promotion_checkout",
  "011_pos_codes_receipt_names",
];
const source = files
  .map((n) =>
    readFileSync("supabase/migrations/" + n + ".sql", "utf8")
      .replace(/^begin;\s*/m, "")
      .replace(/commit;\s*$/, ""),
  )
  .join("\n");
writeFileSync(
  "supabase/releases/20261119-bilingual-pos-promotions.sql",
  "-- Complete CHIPSTI target-specific release. Generated by scripts/build-current-promotion-release.mjs\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='120s';\n" +
    guard +
    "\n" +
    lockAndHash +
    "\n" +
    backup +
    "\n" +
    source +
    "\n" +
    verifyHashes +
    "\nnotify pgrst,'reload schema';\ncomment on function checkout(jsonb) is 'CHIPSTI bilingual POS promotion release 20261119 v1';\ncommit;\n-- END COMPLETE CHIPSTI RELEASE 20261119\n",
);
writeFileSync(
  "supabase/releases/20261119-read-only-preflight.sql",
  "begin read only;\n" + guard + "\nrollback;\n",
);
