begin;
do $chipsti_guard_009$begin
 if to_regprocedure('public.reserve_promotion_for_order(text,uuid)') is null then raise exception 'STOP: Apply migration 008 first in CHIPSTI POS.';end if;
 if not exists(select 1 from businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then raise exception 'STOP: This is not CHIPSTI POS.';end if;
end$chipsti_guard_009$;
alter table online_orders add column promotion_discount_sen bigint not null default 0 check(promotion_discount_sen between 0 and subtotal_sen), add column promo_code text,add column promotion_snapshot jsonb not null default '{}';
alter table online_order_items add column promotion_discount_sen bigint not null default 0 check(promotion_discount_sen between 0 and total_sen),add column english_name text;
-- Historical records get zero discounts and no names inferred from current products.
-- Enforce the accounting boundary independently of the calling API: a ledger
-- entry must match its frozen order and allocations, and a paid redemption must
-- match the actual sale lines and received payment. Legacy orders have no ledger.
create function validate_promotion_redemption() returns trigger language plpgsql security definer set search_path=public,pg_temp as $validate_promotion_redemption$
declare p promotions;o online_orders;s sales;status text;begin
 if TG_OP='INSERT' then
  select * into strict p from promotions where id=new.promotion_id for update;
  status:=promotion_effective_status(p,clock_timestamp());
  if p.publication_status<>'published' or status<>'Active' then raise exception 'Promotion is %',status;end if;
 else
  select * into strict p from promotions where id=new.promotion_id;
  if (to_jsonb(new)-array['state','sale_id','expires_at']) is distinct from (to_jsonb(old)-array['state','sale_id','expires_at']) then raise exception 'Promotion redemption financial snapshots are immutable';end if;
  if old.state in ('redeemed','released') and (new.state<>old.state or new.sale_id is distinct from old.sale_id or new.expires_at<>old.expires_at) then raise exception 'A completed or released redemption cannot be reused';end if;
  if new.expires_at>old.expires_at then raise exception 'A promotion hold cannot be extended';end if;
 end if;
 select * into strict o from online_orders where id=new.order_id;
 if p.branch_id<>new.branch_id or o.branch_id<>new.branch_id or not exists(select 1 from branches where id=new.branch_id and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'Promotion branch/business mismatch';end if;
 if o.promo_code is distinct from new.code or o.promotion_discount_sen<>new.discount_sen or o.subtotal_sen<>new.product_subtotal_sen or o.promotion_snapshot is distinct from new.snapshot or new.expires_at<>o.expires_at then raise exception 'Promotion/order snapshot mismatch';end if;
 if coalesce((select sum(promotion_discount_sen) from online_order_items where order_id=o.id),0)<>new.discount_sen or coalesce((select sum(total_sen) from online_order_items where order_id=o.id),0)<>o.subtotal_sen then raise exception 'Promotion line allocation mismatch';end if;
 if TG_OP='INSERT' then
  if new.state<>'reserved' or new.sale_id is not null or o.sale_id is not null or o.status not in ('awaiting_payment','payment_submitted') or new.expires_at<=clock_timestamp() or new.promotion_version<>p.version or new.code<>p.code or new.promotion_name<>p.name then raise exception 'Invalid new promotion reservation';end if;
 elsif old.state='reserved' and new.state='redeemed' then
  if new.expires_at<=clock_timestamp() or o.sale_id is distinct from new.sale_id then raise exception 'Promotion reservation expired or sale does not match';end if;
  select * into strict s from sales where id=new.sale_id and branch_id=new.branch_id;
  if s.idempotency_key<>o.idempotency_key or s.discount_sen<>new.discount_sen or s.subtotal_sen<>o.subtotal_sen+o.delivery_fee_sen or s.tax_sen<>o.tax_sen or s.total_sen<>o.total_sen or coalesce((select sum(discount_sen) from sale_items where sale_id=s.id),0)<>new.discount_sen or coalesce((select sum(total_sen) from sale_items where sale_id=s.id),0)<>s.subtotal_sen-s.discount_sen or coalesce((select sum(amount_sen) from payments where sale_id=s.id),0)<>s.total_sen then raise exception 'Promotion sale lines, tax or payment do not match the order';end if;
  if (select count(*) from sale_items where sale_id=s.id and product_id is not null)<>(select count(*) from online_order_items where order_id=o.id) or
   exists(select 1 from sale_items si where si.sale_id=s.id and si.product_id is not null and not exists(select 1 from online_order_items i where i.order_id=o.id and i.product_id=si.product_id and i.quantity=si.quantity and i.unit_price_sen=si.unit_price_sen and i.promotion_discount_sen=si.discount_sen and i.total_sen-i.promotion_discount_sen=si.total_sen)) or
   exists(select 1 from online_order_items i where i.order_id=o.id and not exists(select 1 from sale_items si where si.sale_id=s.id and si.product_id=i.product_id)) or
   (select count(*) from sale_items where sale_id=s.id and product_id is null)<>(case when o.delivery_fee_sen>0 then 1 else 0 end) or
   exists(select 1 from sale_items si where si.sale_id=s.id and si.product_id is null and (si.sku<>'DELIVERY' or si.quantity<>1 or si.unit_price_sen<>o.delivery_fee_sen or si.discount_sen<>0 or si.total_sen<>o.delivery_fee_sen)) then raise exception 'Promotion sale product/quantity/allocation does not match its order';end if;
 elsif old.state='reserved' and new.state='released' and (o.sale_id is not null or o.status<>'cancelled') then raise exception 'Only a cancelled unpaid order releases a promotion hold';end if;
 return new;
end
$validate_promotion_redemption$;
create trigger promotion_redemption_integrity before insert or update on promotion_redemptions for each row execute function validate_promotion_redemption();
revoke all on function validate_promotion_redemption() from public,anon,authenticated,service_role;

create function validate_online_pricing_payload(payload jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $validate_online_pricing_payload$begin
 if payload is null or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid order payload';end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('key','expected_total_sen','name','phone','email','fulfillment','address','postcode','notes','payment_method','proof_id','proof_token','payment_reference','website','items','promo_code')) then raise exception 'Client-supplied prices or discounts are not accepted';end if;
 perform validate_promotion_items(payload->'items');
 if payload ? 'promo_code' and (jsonb_typeof(payload->'promo_code') is distinct from 'string' or upper(trim(payload->>'promo_code'))!~'^[A-Z0-9][A-Z0-9_-]{2,31}$') then raise exception 'Invalid promo code';end if;
end$validate_online_pricing_payload$;
revoke all on function validate_online_pricing_payload(jsonb) from public,anon,authenticated,service_role;

create or replace function quote_online_order(payload jsonb) returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $quote_online_order$
declare s online_store_settings; line jsonb; p products; q integer; subtotal bigint:=0; rate integer; quote jsonb; fee bigint; tax bigint; discount bigint:=0; promo jsonb;
begin
 perform validate_online_pricing_payload(payload);
 select * into strict s from online_store_settings where branch_id='20000000-0000-0000-0000-000000000001' and enabled;
 if (payload->>'fulfillment'='pickup' and not s.allow_pickup) or (payload->>'fulfillment'='delivery' and not s.allow_delivery) then raise exception 'Selected fulfillment method is unavailable';end if;
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Invalid cart';end if;
 if (select count(*) from jsonb_array_elements(payload->'items'))<>(select count(distinct value->>'product_id') from jsonb_array_elements(payload->'items')) then raise exception 'Duplicate products';end if;
 for line in select value from jsonb_array_elements(payload->'items') loop
  select * into strict p from products where id=(line->>'product_id')::uuid and not archived;
  q:=(line->>'quantity')::integer;
  if q not between 1 and 100 then raise exception 'Invalid quantity';end if;
  if not exists(select 1 from inventory i where i.branch_id=s.branch_id and i.product_id=p.id and i.quantity-reserved_stock(i.branch_id,p.id)>=q) then raise exception 'Not enough stock for %',p.sku;end if;
  subtotal:=subtotal+p.price_sen*q;
 end loop;
 if subtotal>100000000 then raise exception 'Order amount exceeds limit';end if;
 if nullif(trim(payload->>'promo_code'),'') is not null then promo:=shop_promotion_quote(payload->>'promo_code',payload->'items');discount:=(promo->>'discount_sen')::bigint;end if;
 quote:=shop_delivery_quote(s.branch_id,payload->>'fulfillment',payload->>'postcode',payload->>'address',subtotal,discount);
 fee:=(quote->>'fee_sen')::bigint;
 select tax_bps into strict rate from system_settings where branch_id=s.branch_id;
 tax:=((subtotal-discount+fee)*rate+5000)/10000;
 if subtotal-discount+fee+tax<1 then raise exception 'Order total must be at least RM0.01; zero-payment orders are not supported';end if;
 return quote||jsonb_build_object('subtotal_sen',subtotal,'tax_sen',tax,'total_sen',subtotal-discount+fee+tax,'promotion_discount_sen',discount,'promo_code',promo->>'code','promotion_name',promo->>'name','promotion_percent_bps',promo->'percent_bps');
end$quote_online_order$;
revoke all on function quote_online_order(jsonb) from public,anon,authenticated;
grant execute on function quote_online_order(jsonb) to service_role;

create or replace function place_online_order(payload jsonb,client_bucket text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $place_online_order$
declare setting online_store_settings; old online_orders; oid uuid; token uuid; number text; line jsonb; p products; q integer; subtotal bigint:=0; fee bigint; tax bigint; rate integer; total bigint; request_fingerprint text; hits_now integer; quote jsonb; proof payment_proofs; offer promotions; promo jsonb; discount bigint:=0; eligible bigint:=0; cumulative bigint:=0; allocated bigint:=0; line_discount bigint:=0;
begin
 perform validate_online_pricing_payload(payload);
 if client_bucket is null or length(client_bucket)<>64 then raise exception 'Invalid request bucket';end if;
 request_fingerprint:=md5((payload-'website')::text);
 perform pg_advisory_xact_lock(hashtextextended(payload->>'key',0));
 select * into old from online_orders where idempotency_key=(payload->>'key')::uuid;
 if found then
  if old.request_hash<>request_fingerprint then raise exception 'This request identifier belongs to a different order. Start a new checkout.';end if;
  return jsonb_build_object('token',old.tracking_token,'order_number',old.order_number);end if;
 if length(coalesce(payload->>'website',''))>0 then raise exception 'Invalid order';end if;
 if payload->>'payment_method'='duitnow' then
  select * into proof from payment_proofs where id=(payload->>'proof_id')::uuid and claim_token=(payload->>'proof_token')::uuid and status='ready' and order_id is null and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Upload a valid payment proof before placing a QR order';end if;
  if proof.total_sen<>(payload->>'expected_total_sen')::bigint then raise exception 'Receipt was uploaded for a different order amount';end if;
 end if;
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
 if payload->>'fulfillment'='delivery' and cardinality(setting.delivery_postcode_prefixes)>0 and not exists(select 1 from unnest(setting.delivery_postcode_prefixes) prefix where payload->>'postcode' like prefix||'%') then raise exception 'This postcode is outside our delivery area';end if;
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Invalid cart';end if;
 if (select count(*) from jsonb_array_elements(payload->'items'))<>(select count(distinct value->>'product_id') from jsonb_array_elements(payload->'items')) then raise exception 'Duplicate products';end if;
 if nullif(trim(payload->>'promo_code'),'') is not null then
  select * into strict offer from promotions where code=upper(trim(payload->>'promo_code')) and branch_id=setting.branch_id for update;
 end if;
 perform 1 from inventory where branch_id=setting.branch_id and product_id in(select (value->>'product_id')::uuid from jsonb_array_elements(payload->'items')) order by product_id for update;
 for line in select value from jsonb_array_elements(payload->'items') loop
  select * into strict p from products where id=(line->>'product_id')::uuid and not archived for share;
  q:=(line->>'quantity')::integer;if q not between 1 and 100 then raise exception 'Invalid quantity';end if;
  if not exists(select 1 from inventory i where i.branch_id=setting.branch_id and i.product_id=p.id and i.quantity-reserved_stock(i.branch_id,p.id)>=q) then raise exception 'Not enough stock for %',p.sku;end if;
  subtotal:=subtotal+p.price_sen*q;if subtotal>100000000 then raise exception 'Order amount exceeds limit';end if;
 end loop;
 if offer.id is not null then
  promo:=evaluate_promotion(offer.id,promotion_priced_cart(payload->'items'),clock_timestamp(),false,0);discount:=(promo->>'discount_sen')::bigint;eligible:=(promo->>'eligible_subtotal_sen')::bigint;
 end if;
 -- Only the authoritative promotion engine supplies discounts. Reject price overrides.
 if payload ? 'discount_sen' or payload ? 'delivery_fee_sen' or payload ? 'subtotal_sen' then raise exception 'Client-supplied prices or discounts are not accepted';end if;
 quote:=shop_delivery_quote(setting.branch_id,payload->>'fulfillment',payload->>'postcode',payload->>'address',subtotal,discount);
 fee:=(quote->>'fee_sen')::bigint;
 select tax_bps into strict rate from system_settings where branch_id=setting.branch_id;
 tax:=((subtotal-discount+fee)*rate+5000)/10000;total:=subtotal-discount+fee+tax;
 if total<1 then raise exception 'Order total must be at least RM0.01; zero-payment orders are not supported';end if;
 if coalesce((payload->>'expected_total_sen')::bigint,-1)<>total then raise exception 'Prices or delivery charges changed. Refresh your basket before ordering.';end if;
 number:='WEB-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('online_order_sequence')::text,6,'0');
 insert into online_orders(idempotency_key,request_hash,order_number,branch_id,customer_name,phone,email,fulfillment,address,postcode,notes,payment_method,instructions,subtotal_sen,delivery_fee_sen,tax_bps,tax_sen,total_sen,standard_delivery_fee_sen,delivery_discount_sen,delivery_area_name,promotion_discount_sen,promo_code,promotion_snapshot,created_at,expires_at)
 values((payload->>'key')::uuid,request_fingerprint,number,setting.branch_id,payload->>'name',payload->>'phone',nullif(payload->>'email',''),payload->>'fulfillment',coalesce(payload->>'address',''),coalesce(payload->>'postcode',''),coalesce(payload->>'notes',''),payload->>'payment_method',jsonb_build_object('pickup_address',setting.pickup_address,'contact_phone',setting.contact_phone,'bank_name',setting.bank_name,'bank_account_name',setting.bank_account_name,'bank_account_number',setting.bank_account_number,'duitnow_qr_url',case when payload->>'payment_method'='duitnow' then 'https://chipsti.com/branding/chipsti-duitnow.original.jpeg' else setting.duitnow_qr_url end,'delivery_note',setting.delivery_note),subtotal,fee,rate,tax,total,(quote->>'standard_fee_sen')::bigint,(quote->>'delivery_discount_sen')::bigint,quote->>'area_name',discount,offer.code,coalesce(promo->'snapshot','{}'::jsonb),clock_timestamp(),clock_timestamp()+interval '24 hours')
 returning id,tracking_token into oid,token;
 for line in select value from jsonb_array_elements(payload->'items') loop
  select * into strict p from products where id=(line->>'product_id')::uuid;
  q:=(line->>'quantity')::integer;
  line_discount:=0;
  if discount>0 and (cardinality(offer.eligible_product_ids)+cardinality(offer.eligible_category_ids)=0 or p.id=any(offer.eligible_product_ids) or coalesce(p.category_id=any(offer.eligible_category_ids),false)) and not (p.id=any(offer.excluded_product_ids)) and not coalesce(p.category_id=any(offer.excluded_category_ids),false) then
   cumulative:=cumulative+p.price_sen*q;line_discount:=(cumulative*discount+eligible/2)/eligible-allocated;allocated:=allocated+line_discount;
  end if;
  insert into online_order_items(order_id,product_id,sku,name,english_name,category_name,quantity,unit_price_sen,total_sen,promotion_discount_sen) values(oid,p.id,p.sku,p.name,p.english_name,(select name from product_categories where id=p.category_id),q,p.price_sen,p.price_sen*q,line_discount);
 end loop;
 if allocated<>discount then raise exception 'Promotion line allocation mismatch';end if;
 if offer.id is not null then perform reserve_promotion_for_order(offer.code,oid);end if;
 update inventory set quantity=quantity where branch_id=setting.branch_id and product_id in(select product_id from online_order_items where order_id=oid);
 insert into online_order_events(order_id,event) values(oid,'Order received; payment not verified');
 if payload->>'payment_method'='duitnow' then
  update payment_proofs set order_id=oid where id=proof.id and status='ready' and order_id is null and expires_at>clock_timestamp();
  if not found then raise exception 'Payment proof expired while waiting; upload a fresh proof';end if;
  update online_orders set payment_proof_received=true,status='payment_submitted',payment_reference=coalesce(nullif(trim(payload->>'payment_reference'),''),'Payment proof '||proof.id::text) where id=oid;
  insert into online_order_events(order_id,event) values(oid,'Payment proof received; PENDING VERIFICATION');
 end if;
 return jsonb_build_object('token',token,'order_number',number);
end$place_online_order$;
revoke all on function place_online_order(jsonb,text) from public,anon,authenticated;
grant execute on function place_online_order(jsonb,text) to service_role;



create or replace function manage_online_order_before_delivery(action text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $manage_online_order_before_delivery$
declare o online_orders; sess uuid; sid uuid; itemid uuid; customer uuid; r record; amount bigint; tendered bigint; current_cost bigint;
begin
 perform require_role(array['owner','manager']);
 if action='configure' then
  perform require_role(array['owner']);
  if (payload->>'enabled')::boolean and (payload->>'allow_pickup')::boolean and length(trim(payload->>'pickup_address'))<5 then raise exception 'Enter the pickup address before enabling pickup';end if;
  if (payload->>'enabled')::boolean and (payload->>'allow_delivery')::boolean and length(trim(coalesce(payload->>'delivery_note','')))=0 then raise exception 'Enter delivery instructions';end if;
  if (payload->>'enabled')::boolean and ((payload->>'allow_delivery')::boolean or ((payload->>'allow_pickup')::boolean and not (payload->>'allow_cash_pickup')::boolean)) and (length(trim(coalesce(payload->>'bank_name','')))=0 or length(trim(coalesce(payload->>'bank_account_name','')))=0 or length(trim(coalesce(payload->>'bank_account_number','')))=0) and length(trim(coalesce(payload->>'duitnow_qr_url','')))=0 then raise exception 'Configure bank transfer or DuitNow before enabling non-cash orders';end if;
  if exists(select 1 from jsonb_array_elements_text(payload->'delivery_postcode_prefixes') prefix where prefix!~'^[0-9]{1,5}$') then raise exception 'Invalid delivery postcode prefix';end if;
  update online_store_settings set enabled=(payload->>'enabled')::boolean,allow_pickup=(payload->>'allow_pickup')::boolean,allow_delivery=(payload->>'allow_delivery')::boolean,allow_cash_pickup=(payload->>'allow_cash_pickup')::boolean,
  pickup_address=coalesce(payload->>'pickup_address',''),contact_phone=coalesce(payload->>'contact_phone',''),delivery_fee_sen=(payload->>'delivery_fee_sen')::bigint,
  delivery_postcode_prefixes=coalesce(array(select jsonb_array_elements_text(payload->'delivery_postcode_prefixes')),'{}'),delivery_note=coalesce(payload->>'delivery_note',''),
  bank_name=coalesce(payload->>'bank_name',''),bank_account_name=coalesce(payload->>'bank_account_name',''),bank_account_number=coalesce(payload->>'bank_account_number',''),duitnow_qr_url=coalesce(payload->>'duitnow_qr_url','') where branch_id=staff_branch();
  insert into audit_logs(staff_id,action,details) values(auth.uid(),'online_store_settings',payload);return null;
 end if;
 -- Match the established session -> inventory lock ordering used by POS checkout.
 if action='confirm_payment' then
  select id into sess from cashier_sessions where cashier_id=auth.uid() and branch_id=staff_branch() and status='open' for update;
  if sess is null then raise exception 'Open a cashier session before confirming payments';end if;
 end if;
 select * into strict o from online_orders where id=(payload->>'id')::uuid and branch_id=staff_branch() for update;
 if action='cancel' then
  if o.status='cancelled' then return o.id;end if;
  if o.sale_id is not null then raise exception 'Paid orders must be refunded through the Refunds module';end if;
  if length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Cancellation reason required';end if;
  update online_orders set status='cancelled',cancellation_reason=payload->>'reason' where id=o.id;
 elsif action='fulfill' then
  if o.sale_id is null then raise exception 'Confirm payment before fulfillment';end if;
  if coalesce((select sum(total_sen) from refunds where sale_id=o.sale_id),0)>=o.total_sen then raise exception 'This order has been fully refunded';end if;
  if o.status not in ('paid','ready','dispatched','completed') then raise exception 'Invalid fulfillment state';end if;
  if payload->>'status' not in ('ready','dispatched','completed') then raise exception 'Invalid fulfillment state';end if;
  if o.status='completed' and payload->>'status'<>'completed' then raise exception 'Completed orders cannot move backwards';end if;
  if payload->>'status'='ready' and (o.fulfillment<>'pickup' or o.status not in ('paid','ready')) then raise exception 'Invalid pickup state';end if;
  if payload->>'status'='dispatched' and (o.fulfillment<>'delivery' or o.status not in ('paid','dispatched')) then raise exception 'Invalid delivery state';end if;
  update online_orders set status=payload->>'status' where id=o.id;
 elsif action='confirm_payment' then
  if not coalesce((payload->>'verified')::boolean,false) then raise exception 'Confirm that you verified payment before creating a sale';end if;
  if o.sale_id is not null then return o.sale_id;end if;
  if o.status not in ('awaiting_payment','payment_submitted') or o.expires_at<=clock_timestamp() then raise exception 'Order has expired or was cancelled. Recheck stock and create a new order.';end if;
  if o.promo_code is not null and not exists(select 1 from promotion_redemptions where order_id=o.id and state='reserved' and expires_at>clock_timestamp()) then raise exception 'Promotion reservation expired. Create a new order.';end if;
  if o.payment_method<>'cash' and (o.payment_reference is null or length(trim(coalesce(payload->>'reference','')))<3) then raise exception 'Verify funds received and enter the bank/payment reference';end if;
  perform 1 from inventory where branch_id=o.branch_id and product_id in(select product_id from online_order_items where order_id=o.id) order by product_id for update;
  -- Inventory locks can wait past the reservation deadline. Check again now.
  if o.expires_at<=clock_timestamp() or (o.promo_code is not null and not exists(select 1 from promotion_redemptions where order_id=o.id and state='reserved' and expires_at>clock_timestamp())) then raise exception 'Order or promotion reservation expired while waiting. Create a new order.';end if;
  -- Release this reservation inside the transaction, then deduct physical inventory.
  update online_orders set status='paid' where id=o.id;
  insert into customers(name,phone,email,marketing_consent) values(o.customer_name,o.phone,o.email,false) returning id into customer;
  insert into sales(idempotency_key,receipt_number,cashier_name,branch_id,cashier_id,session_id,customer_id,subtotal_sen,discount_sen,tax_sen,total_sen)
  values(o.idempotency_key,'CHIP-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('receipt_sequence')::text,6,'0'),(select display_name from profiles where id=auth.uid()),o.branch_id,auth.uid(),sess,customer,o.subtotal_sen+o.delivery_fee_sen,o.promotion_discount_sen,o.tax_sen,o.total_sen) returning id into sid;
  for r in select * from online_order_items where order_id=o.id order by product_id loop
   select c.cost_sen into strict current_cost from products p join product_costs c on c.product_id=p.id where p.id=r.product_id for share of p,c;
   insert into sale_items(sale_id,product_id,sku,name,category_name,quantity,unit_price_sen,discount_sen,total_sen) values(sid,r.product_id,r.sku,r.name,r.category_name,r.quantity,r.unit_price_sen,r.promotion_discount_sen,r.total_sen-r.promotion_discount_sen) returning id into itemid;
   update sale_items set category_name=r.category_name where id=itemid;
   insert into sale_item_costs(sale_item_id,cost_sen) values(itemid,current_cost);
   update inventory set quantity=quantity-r.quantity where branch_id=o.branch_id and product_id=r.product_id;
   insert into stock_movements(branch_id,product_id,quantity,movement_type,staff_id,reference_id,reason) values(o.branch_id,r.product_id,-r.quantity,'sale',auth.uid(),sid,'Online order '||o.order_number);
  end loop;
  if o.delivery_fee_sen>0 then
   -- Shipping is its own receipt/refund line with zero product cost and no stock.
   insert into sale_items(sale_id,product_id,sku,name,quantity,unit_price_sen,discount_sen,total_sen) values(sid,null,'DELIVERY','Delivery fee',1,o.delivery_fee_sen,0,o.delivery_fee_sen) returning id into itemid;
   insert into sale_item_costs(sale_item_id,cost_sen) values(itemid,0);
  end if;
  tendered:=coalesce((payload->>'tendered_sen')::bigint,o.total_sen);
  if tendered<o.total_sen or (o.payment_method<>'cash' and tendered<>o.total_sen) then raise exception 'Invalid tendered amount';end if;
  insert into payments(sale_id,method,amount_sen,tendered_sen,reference) values(sid,o.payment_method,o.total_sen,tendered,case when o.payment_method='cash' then o.order_number else trim(payload->>'reference') end);
  update online_orders set sale_id=sid,confirmed_by=auth.uid(),confirmed_at=now() where id=o.id;
 else raise exception 'Unknown online order action';end if;
 insert into online_order_events(order_id,event,staff_id) values(o.id,action||coalesce(': '||(payload->>'status'),''),auth.uid());
 insert into audit_logs(staff_id,action,entity_id,details) values(auth.uid(),'online_order_'||action,o.id,payload);
 return coalesce(sid,o.id);
end$manage_online_order_before_delivery$;

revoke all on function manage_online_order_before_delivery(text,jsonb) from public,anon,authenticated,service_role;

-- Retain the original private-proof and delivery status wrappers. Add only the
-- frozen discount and bilingual item snapshots for new orders.
alter function online_order_status(uuid) rename to online_order_status_before_promotions;
revoke all on function online_order_status_before_promotions(uuid) from public,anon,authenticated,service_role;
create function online_order_status(token uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $online_order_status$
 select online_order_status_before_promotions(token)||jsonb_build_object('promotion_discount_sen',o.promotion_discount_sen,'promo_code',o.promo_code,'promotion_snapshot',o.promotion_snapshot,'items',
 (select jsonb_agg(jsonb_build_object('sku',i.sku,'name',i.name,'english_name',i.english_name,'quantity',i.quantity,'unit_price_sen',i.unit_price_sen,'total_sen',i.total_sen-i.promotion_discount_sen,'promotion_discount_sen',i.promotion_discount_sen,'refunded_quantity',coalesce((select sum(ri.quantity) from refund_items ri join sale_items si on si.id=ri.sale_item_id where si.sale_id=o.sale_id and si.product_id=i.product_id),0)) order by i.sku) from online_order_items i where i.order_id=o.id)) from online_orders o where o.tracking_token=token
$online_order_status$;
revoke all on function online_order_status(uuid) from public,anon,authenticated;
grant execute on function online_order_status(uuid) to service_role;
-- Campaign publication is a separate, explicitly approved owner action.
-- This reviewed migration leaves CGSVIP20 as a draft.
commit;
