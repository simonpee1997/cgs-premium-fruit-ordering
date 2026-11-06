begin;
-- Apply only to CHIPSTI POS after 004. Does not rewrite any existing orders,
-- products, inventory, fees, payment instructions or fulfillment settings.
do $$begin
 if to_regclass('public.online_store_settings') is null or to_regprocedure('public.manage_online_order(text,jsonb)') is null then
  raise exception 'STOP: Apply online-store migration 004 first in CHIPSTI POS.';
 end if;
 if not exists(select 1 from public.businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then
  raise exception 'STOP: This is not the CHIPSTI POS database.';
 end if;
end$$;

alter table online_store_settings add column delivery_areas jsonb not null default '[]'::jsonb check(jsonb_typeof(delivery_areas)='array');
alter table online_orders add column standard_delivery_fee_sen bigint check(standard_delivery_fee_sen>=0),
 add column delivery_discount_sen bigint not null default 0 check(delivery_discount_sen>=0),
 add column delivery_area_name text;

create function validate_delivery_areas(areas jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare entry jsonb; code text;
begin
 if areas is null or jsonb_typeof(areas)<>'array' then raise exception 'Invalid delivery areas';end if;
 if jsonb_array_length(areas)>20 then raise exception 'Maximum 20 delivery areas';end if;
 for entry in select value from jsonb_array_elements(areas) loop
  if jsonb_typeof(entry)<>'object' or coalesce(entry->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or length(trim(coalesce(entry->>'name',''))) not between 1 and 100 then raise exception 'Invalid delivery area name or identifier';end if;
  if coalesce(jsonb_typeof(entry->'postcodes'),'null')<>'array' then raise exception 'Invalid delivery area postcodes';end if;
  if jsonb_array_length(entry->'postcodes') not between 1 and 100 then raise exception 'Each area needs 1 to 100 exact postcodes';end if;
  for code in select jsonb_array_elements_text(entry->'postcodes') loop
   if code!~'^[0-9]{5}$' or code is null then raise exception 'Use exact five-digit delivery postcodes';end if;
  end loop;
  if coalesce(jsonb_typeof(entry->'standard_fee_sen'),'null')<>'number' or coalesce(entry->>'standard_fee_sen','')!~'^[0-9]+$' then raise exception 'Invalid area delivery fee';end if;
  if (entry->>'standard_fee_sen')::numeric>10000000 then raise exception 'Invalid area delivery fee';end if;
  if coalesce(jsonb_typeof(entry->'free_delivery_eligible'),'null')<>'boolean' then raise exception 'Confirm whether the area is in Klang Valley';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(areas))<>(select count(distinct a->>'id') from jsonb_array_elements(areas) a) then raise exception 'Duplicate delivery area';end if;
 if (select count(*) from jsonb_array_elements(areas) a cross join lateral jsonb_array_elements_text(a->'postcodes') p)<>(select count(distinct p) from jsonb_array_elements(areas) a cross join lateral jsonb_array_elements_text(a->'postcodes') p) then raise exception 'Each delivery postcode must belong to only one area';end if;
end$$;
revoke all on function validate_delivery_areas(jsonb) from public,anon,authenticated,service_role;

create function shop_delivery_quote(branch uuid,fulfillment text,postcode text,address text,product_subtotal bigint,product_discount bigint default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s online_store_settings; area jsonb; standard bigint:=0; saving bigint:=0;
begin
 if product_subtotal is null or product_discount is null or product_subtotal<0 or product_discount<0 or product_discount>product_subtotal then raise exception 'Invalid product subtotal or discount';end if;
 select * into strict s from online_store_settings where branch_id=branch;
 if fulfillment='delivery' then
  if coalesce(postcode,'')!~'^[0-9]{5}$' or length(trim(coalesce(address,'')))<10 then raise exception 'Enter a complete delivery address and five-digit postcode';end if;
  if cardinality(s.delivery_postcode_prefixes)>0 and not exists(select 1 from unnest(s.delivery_postcode_prefixes) prefix where postcode like prefix||'%') then raise exception 'This postcode is outside our delivery area';end if;
  select a into area from jsonb_array_elements(s.delivery_areas) a where a->'postcodes' ? postcode;
  standard:=coalesce((area->>'standard_fee_sen')::bigint,s.delivery_fee_sen);
  if coalesce((area->>'free_delivery_eligible')::boolean,false) and product_subtotal-product_discount>=30000 then saving:=standard;end if;
 elsif fulfillment<>'pickup' or fulfillment is null then raise exception 'Invalid fulfillment method';
 end if;
 return jsonb_build_object('standard_fee_sen',standard,'delivery_discount_sen',saving,'fee_sen',standard-saving,'area_name',area->>'name');
end$$;
revoke all on function shop_delivery_quote(uuid,text,text,text,bigint,bigint) from public,anon,authenticated,service_role;

-- Keep the original role checks, configuration validation, audit and payment/
-- fulfillment lifecycle private; only extend the owner configuration operation.
alter function manage_online_order(text,jsonb) rename to manage_online_order_before_delivery;
revoke all on function manage_online_order_before_delivery(text,jsonb) from public,anon,authenticated,service_role;
create function manage_online_order(action text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if action='configure' then
  perform require_role(array['owner']);
  if payload ? 'delivery_areas' then perform validate_delivery_areas(payload->'delivery_areas');end if;
 end if;
 result:=manage_online_order_before_delivery(action,payload);
 if action='configure' and payload ? 'delivery_areas' then
  update online_store_settings set delivery_areas=payload->'delivery_areas' where branch_id=staff_branch();
 end if;
 return result;
end$$;
revoke all on function manage_online_order(text,jsonb) from public,anon,service_role;
grant execute on function manage_online_order(text,jsonb) to authenticated;

alter function shop_catalogue() rename to shop_catalogue_before_delivery;
revoke all on function shop_catalogue_before_delivery() from public,anon,authenticated,service_role;
create function shop_catalogue() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with catalogue as materialized (select shop_catalogue_before_delivery() as data)
 select jsonb_set(c.data,'{store}',
 (c.data->'store') || jsonb_build_object('delivery_areas',s.delivery_areas,'free_delivery_threshold_sen',30000))
 from online_store_settings s cross join catalogue c where s.branch_id='20000000-0000-0000-0000-000000000001'
$$;
revoke all on function shop_catalogue() from public;
grant execute on function shop_catalogue() to anon,authenticated,service_role;

create or replace function place_online_order(payload jsonb,client_bucket text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare setting online_store_settings; old online_orders; oid uuid; token uuid; number text; line jsonb; p products; q integer; subtotal bigint:=0; fee bigint; tax bigint; rate integer; total bigint; request_fingerprint text; hits_now integer; quote jsonb;
begin
 if client_bucket is null or length(client_bucket)<>64 then raise exception 'Invalid request bucket';end if;
 request_fingerprint:=md5((payload-'website')::text);
 perform pg_advisory_xact_lock(hashtextextended(payload->>'key',0));
 select * into old from online_orders where idempotency_key=(payload->>'key')::uuid;
 if found then
  if old.request_hash<>request_fingerprint then raise exception 'This request identifier belongs to a different order. Start a new checkout.';end if;
  return jsonb_build_object('token',old.tracking_token,'order_number',old.order_number);end if;
 if length(coalesce(payload->>'website',''))>0 then raise exception 'Invalid order';end if;
 insert into shop_rate_limits(bucket,window_start,hits) values(client_bucket,now(),1)
 on conflict(bucket) do update set hits=case when shop_rate_limits.window_start<now()-interval '1 hour' then 1 else shop_rate_limits.hits+1 end,
 window_start=case when shop_rate_limits.window_start<now()-interval '1 hour' then now() else shop_rate_limits.window_start end returning hits into hits_now;
 if hits_now>10 then raise exception 'Too many orders. Please try again later.';end if;
 -- Discard expired rate buckets; no customer IP address is stored.
 delete from shop_rate_limits where window_start<now()-interval '2 days';
 select * into strict setting from online_store_settings where branch_id='20000000-0000-0000-0000-000000000001' and enabled for share;
 if payload->>'fulfillment'='pickup' and not setting.allow_pickup then raise exception 'Pickup is unavailable';end if;
 if payload->>'fulfillment'='delivery' and not setting.allow_delivery then raise exception 'Delivery is unavailable';end if;
 if payload->>'payment_method'='cash' and (payload->>'fulfillment'<>'pickup' or not setting.allow_cash_pickup) then raise exception 'Cash is available only for eligible store pickup';end if;
 if payload->>'payment_method'='bank' and (setting.bank_name='' or setting.bank_account_name='' or setting.bank_account_number='') then raise exception 'Bank transfer is not configured';end if;
 if payload->>'payment_method'='duitnow' and setting.duitnow_qr_url='' then raise exception 'DuitNow QR is not configured';end if;
 if payload->>'fulfillment'='delivery' and cardinality(setting.delivery_postcode_prefixes)>0 and not exists(select 1 from unnest(setting.delivery_postcode_prefixes) prefix where payload->>'postcode' like prefix||'%') then raise exception 'This postcode is outside our delivery area';end if;
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Invalid cart';end if;
 if (select count(*) from jsonb_array_elements(payload->'items'))<>(select count(distinct value->>'product_id') from jsonb_array_elements(payload->'items')) then raise exception 'Duplicate products';end if;
 perform 1 from inventory where branch_id=setting.branch_id and product_id in(select (value->>'product_id')::uuid from jsonb_array_elements(payload->'items')) order by product_id for update;
 for line in select value from jsonb_array_elements(payload->'items') loop
  select * into strict p from products where id=(line->>'product_id')::uuid and not archived for share;
  q:=(line->>'quantity')::integer;if q not between 1 and 100 then raise exception 'Invalid quantity';end if;
  if not exists(select 1 from inventory i where i.branch_id=setting.branch_id and i.product_id=p.id and i.quantity-reserved_stock(i.branch_id,p.id)>=q) then raise exception 'Not enough stock for %',p.sku;end if;
  subtotal:=subtotal+p.price_sen*q;if subtotal>100000000 then raise exception 'Order amount exceeds limit';end if;
 end loop;
 -- All prices and discounts come from the server. Online product discounts are
 -- currently unsupported; a caller may not supply a discount or shipping override.
 if payload ? 'discount_sen' or payload ? 'delivery_fee_sen' or payload ? 'subtotal_sen' then raise exception 'Client-supplied prices or discounts are not accepted';end if;
 quote:=shop_delivery_quote(setting.branch_id,payload->>'fulfillment',payload->>'postcode',payload->>'address',subtotal,0);
 fee:=(quote->>'fee_sen')::bigint;
 select tax_bps into strict rate from system_settings where branch_id=setting.branch_id;
 tax:=((subtotal+fee)*rate+5000)/10000;total:=subtotal+fee+tax;
 if coalesce((payload->>'expected_total_sen')::bigint,-1)<>total then raise exception 'Prices or delivery charges changed. Refresh your basket before ordering.';end if;
 number:='WEB-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('online_order_sequence')::text,6,'0');
 insert into online_orders(idempotency_key,request_hash,order_number,branch_id,customer_name,phone,email,fulfillment,address,postcode,notes,payment_method,instructions,subtotal_sen,delivery_fee_sen,tax_bps,tax_sen,total_sen,standard_delivery_fee_sen,delivery_discount_sen,delivery_area_name)
 values((payload->>'key')::uuid,request_fingerprint,number,setting.branch_id,payload->>'name',payload->>'phone',nullif(payload->>'email',''),payload->>'fulfillment',coalesce(payload->>'address',''),coalesce(payload->>'postcode',''),coalesce(payload->>'notes',''),payload->>'payment_method',jsonb_build_object('pickup_address',setting.pickup_address,'contact_phone',setting.contact_phone,'bank_name',setting.bank_name,'bank_account_name',setting.bank_account_name,'bank_account_number',setting.bank_account_number,'duitnow_qr_url',setting.duitnow_qr_url,'delivery_note',setting.delivery_note),subtotal,fee,rate,tax,total,(quote->>'standard_fee_sen')::bigint,(quote->>'delivery_discount_sen')::bigint,quote->>'area_name')
 returning id,tracking_token into oid,token;
 for line in select value from jsonb_array_elements(payload->'items') loop
  select * into strict p from products where id=(line->>'product_id')::uuid;
  q:=(line->>'quantity')::integer;
  insert into online_order_items(order_id,product_id,sku,name,category_name,quantity,unit_price_sen,total_sen) values(oid,p.id,p.sku,p.name,(select name from product_categories where id=p.category_id),q,p.price_sen,p.price_sen*q);
 end loop;
 update inventory set quantity=quantity where branch_id=setting.branch_id and product_id in(select product_id from online_order_items where order_id=oid);
 insert into online_order_events(order_id,event) values(oid,'Order received; payment not verified');
 return jsonb_build_object('token',token,'order_number',number);
end$$;
revoke all on function place_online_order(jsonb,text) from public,anon,authenticated;
grant execute on function place_online_order(jsonb,text) to service_role;


-- Old order quotes remain frozen. Nullable standard fee falls back to their
-- original charged fee; no historical receipt or order is repriced.
alter function online_order_status(uuid) rename to online_order_status_before_delivery;
revoke all on function online_order_status_before_delivery(uuid) from public,anon,authenticated,service_role;
create function online_order_status(token uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select online_order_status_before_delivery(token)||jsonb_build_object(
 'standard_delivery_fee_sen',coalesce(o.standard_delivery_fee_sen,o.delivery_fee_sen),
 'delivery_discount_sen',o.delivery_discount_sen,'delivery_area_name',o.delivery_area_name)
 from online_orders o where o.tracking_token=token
$$;
revoke all on function online_order_status(uuid) from public,anon,authenticated;
grant execute on function online_order_status(uuid) to service_role;
commit;
