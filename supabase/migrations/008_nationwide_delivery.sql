-- CHIPSTI-only nationwide delivery. Existing order/payment snapshots are untouched.
begin;
do $preflight$
begin
 if not exists(select 1 from public.online_store_settings s join public.branches b on b.id=s.branch_id join public.businesses x on x.id=b.business_id where s.branch_id='20000000-0000-0000-0000-000000000001' and x.name='CHIPSTI ENTERPRISE' and x.ssm='202603232290 (RA0139100-V)') then raise exception 'CHIPSTI branch verification failed';end if;
 if to_regprocedure('public.shop_delivery_quote_before_nationwide(uuid,text,text,text,bigint,bigint)') is not null or to_regprocedure('public.shop_catalogue_before_nationwide()') is not null then raise exception 'Nationwide delivery already installed; verify before rerunning';end if;
 -- Copy the complete existing implementations rather than renaming their OIDs.
 -- Existing callers keep pointing to the replaced public entry points.
 execute replace(pg_get_functiondef('public.shop_delivery_quote(uuid,text,text,text,bigint,bigint)'::regprocedure),'FUNCTION public.shop_delivery_quote(', 'FUNCTION public.shop_delivery_quote_before_nationwide(');
 execute replace(pg_get_functiondef('public.shop_catalogue()'::regprocedure),'FUNCTION public.shop_catalogue(', 'FUNCTION public.shop_catalogue_before_nationwide(');
end
$preflight$;
revoke all on function public.shop_delivery_quote_before_nationwide(uuid,text,text,text,bigint,bigint) from public,anon,authenticated,service_role;
revoke all on function public.shop_catalogue_before_nationwide() from public,anon,authenticated,service_role;

update public.online_store_settings set delivery_postcode_prefixes='{}'::text[] where branch_id='20000000-0000-0000-0000-000000000001';

create or replace function public.shop_delivery_quote(branch uuid,fulfillment text,postcode text,address text,product_subtotal bigint,product_discount bigint default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $nationwide_quote$
declare quote jsonb;
begin
 -- Keep the saved implementation's address, quantity/subtotal and delivery checks.
 quote:=public.shop_delivery_quote_before_nationwide(branch,fulfillment,postcode,address,product_subtotal,product_discount);
 if branch='20000000-0000-0000-0000-000000000001'::uuid and fulfillment='delivery' and product_subtotal-product_discount>=30000 then
  quote:=quote||jsonb_build_object('delivery_discount_sen',(quote->>'standard_fee_sen')::bigint,'fee_sen',0);
 end if;
 return quote;
end
$nationwide_quote$;
revoke all on function public.shop_delivery_quote(uuid,text,text,text,bigint,bigint) from public,anon,authenticated,service_role;
comment on function public.shop_delivery_quote(uuid,text,text,text,bigint,bigint) is 'CHIPSTI nationwide free delivery v1';

create or replace function public.shop_catalogue() returns jsonb language sql stable security definer set search_path=public,pg_temp as $nationwide_catalogue$
 select jsonb_set(public.shop_catalogue_before_nationwide(),'{store,free_delivery_all_postcodes}','true'::jsonb)
$nationwide_catalogue$;
revoke all on function public.shop_catalogue() from public;
grant execute on function public.shop_catalogue() to anon,authenticated,service_role;
comment on function public.shop_catalogue() is 'CHIPSTI nationwide free delivery v1';
commit;
