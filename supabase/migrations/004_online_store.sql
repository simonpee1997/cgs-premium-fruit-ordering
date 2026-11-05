begin;
-- Only the installed CHIPSTI POS database is an eligible target.
do $$begin
 if to_regclass('public.businesses') is null or to_regprocedure('public.touch_updated_at()') is null or to_regprocedure('public.void_sale(jsonb)') is null then
  raise exception 'STOP: Apply this file only to CHIPSTI POS after migrations 001, 002 and 003.';
 end if;
 if not exists(select 1 from public.businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then
  raise exception 'STOP: This is not the configured CHIPSTI ENTERPRISE database.';
 end if;
end$$;
-- This migration adds the public shop without exposing staff/cost/customer tables.
create table online_store_settings (
 branch_id uuid primary key references branches,
 enabled boolean not null default false,
 allow_pickup boolean not null default true,
 allow_delivery boolean not null default true,
 allow_cash_pickup boolean not null default true,
 pickup_address text not null default '',
 contact_phone text not null default '',
 delivery_fee_sen bigint not null default 0 check(delivery_fee_sen between 0 and 10000000),
 delivery_postcode_prefixes text[] not null default '{}',
 delivery_note text not null default '',
 bank_name text not null default '',bank_account_name text not null default '',bank_account_number text not null default '',
 duitnow_qr_url text not null default '',
 updated_at timestamptz not null default now(),
 check(not enabled or allow_pickup or allow_delivery)
);
insert into online_store_settings(branch_id) select id from branches;
create sequence online_order_sequence;
create table online_orders (
 id uuid primary key default gen_random_uuid(),
 idempotency_key uuid unique not null,
 request_hash text not null,
 tracking_token uuid unique not null default gen_random_uuid(),
 order_number text unique not null,
 branch_id uuid not null references branches,
 status text not null default 'awaiting_payment' check(status in ('awaiting_payment','payment_submitted','paid','ready','dispatched','completed','cancelled')),
 customer_name text not null check(length(customer_name) between 1 and 150),
 phone text not null check(phone~'^[+]?[0-9 ()-]{7,30}$' and length(regexp_replace(phone,'[^0-9]','','g')) between 7 and 15),
 email text check(email is null or length(email)<=254),
 fulfillment text not null check(fulfillment in ('pickup','delivery')),
 address text not null default '',postcode text not null default '',
 notes text not null default '' check(length(notes)<=1000),
 payment_method text not null check(payment_method in ('cash','bank','duitnow')),
 payment_reference text,
 instructions jsonb not null,
 subtotal_sen bigint not null check(subtotal_sen>=0),
 delivery_fee_sen bigint not null check(delivery_fee_sen>=0),
 tax_bps integer not null check(tax_bps between 0 and 10000),
 tax_sen bigint not null check(tax_sen>=0),
 total_sen bigint not null check(total_sen between 1 and 100000000),
 sale_id uuid unique references sales,
 expires_at timestamptz not null default now()+interval '24 hours',
 confirmed_by uuid references profiles,
 confirmed_at timestamptz,
 cancellation_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((fulfillment='pickup') or (length(address)>=10 and postcode~'^[0-9]{5}$'))
);
create table online_order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references online_orders,
 product_id uuid not null references products,
 sku text not null,name text not null,category_name text,
 quantity integer not null check(quantity between 1 and 100),
 unit_price_sen bigint not null check(unit_price_sen>=0),
 total_sen bigint not null check(total_sen>=0),unique(order_id,product_id)
);
create table online_order_events (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references online_orders,
 event text not null,staff_id uuid references profiles,created_at timestamptz not null default now()
);
create table shop_rate_limits(bucket text primary key,window_start timestamptz not null,hits integer not null);
create index online_pending_stock on online_orders(branch_id,status,expires_at);
create index online_item_product on online_order_items(product_id,order_id);
create index shop_rate_limit_expiry on shop_rate_limits(window_start);
create trigger online_settings_updated before update on online_store_settings for each row execute function touch_updated_at();
create trigger online_order_updated before update on online_orders for each row execute function touch_updated_at();
do $$declare target text;begin foreach target in array array['online_store_settings','online_orders','online_order_items','online_order_events','shop_rate_limits'] loop
 execute format('alter table %I enable row level security',target);
 execute format('revoke all on %I from anon,authenticated',target);
end loop;end$$;
grant select on online_store_settings,online_orders,online_order_items,online_order_events to authenticated;
create policy shop_settings_staff on online_store_settings for select to authenticated using(branch_id=staff_branch() and staff_role() in ('owner','manager'));
create policy online_orders_staff on online_orders for select to authenticated using(branch_id=staff_branch() and staff_role() in ('owner','manager'));
create policy online_items_staff on online_order_items for select to authenticated using(order_id in(select id from online_orders));
create policy online_events_staff on online_order_events for select to authenticated using(order_id in(select id from online_orders));

create function reserved_stock(branch uuid,product uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(i.quantity),0) from online_order_items i join online_orders o on o.id=i.order_id
 where o.branch_id=branch and i.product_id=product and o.status in ('awaiting_payment','payment_submitted') and o.expires_at>now()
$$;
revoke all on function reserved_stock(uuid,uuid) from public,anon,authenticated;
-- Every inventory deduction, including the existing POS checkout and adjustments,
-- must leave enough physical stock to honor unexpired customer reservations.
create function protect_reserved_stock() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.quantity<reserved_stock(new.branch_id,new.product_id) then raise exception 'Stock is reserved for online orders. Review or cancel those orders first.';end if;
 return new;
end$$;
revoke all on function protect_reserved_stock() from public,anon,authenticated;
create trigger honor_online_reservations before update of quantity on inventory for each row execute function protect_reserved_stock();

create function stock_availability() returns table(product_id uuid,available bigint,reserved bigint) language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 perform require_role(array['owner','manager','cashier']);
 return query select i.product_id,greatest(0,i.quantity-reserved_stock(i.branch_id,i.product_id)),reserved_stock(i.branch_id,i.product_id) from inventory i where i.branch_id=staff_branch();
end$$;
revoke all on function stock_availability() from public,anon;
grant execute on function stock_availability() to authenticated;

create function shop_catalogue() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'store',jsonb_build_object('name','CHIPSTI ENTERPRISE','ssm','202603232290 (RA0139100-V)',
 'enabled',s.enabled,'allow_pickup',s.allow_pickup,'allow_delivery',s.allow_delivery,'allow_cash_pickup',s.allow_cash_pickup,
 'pickup_address',s.pickup_address,'contact_phone',s.contact_phone,'delivery_fee_sen',s.delivery_fee_sen,
 'delivery_note',s.delivery_note,'delivery_postcode_prefixes',s.delivery_postcode_prefixes,
 'bank_transfer_available',(s.bank_name<>'' and s.bank_account_name<>'' and s.bank_account_number<>''),'duitnow_available',(s.duitnow_qr_url<>''),
 'tax_bps',coalesce((select tax_bps from system_settings where branch_id=s.branch_id),0)),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'english_name',p.english_name,'description',p.description,'price_sen',p.price_sen,'image_url',p.image_url,'category',c.name,'available',greatest(0,i.quantity-reserved_stock(i.branch_id,i.product_id))) order by p.sku)
 from products p join inventory i on i.product_id=p.id and i.branch_id=s.branch_id left join product_categories c on c.id=p.category_id where not p.archived),'[]'::jsonb))
 from online_store_settings s where s.branch_id='20000000-0000-0000-0000-000000000001'
$$;
revoke all on function shop_catalogue() from public;
grant execute on function shop_catalogue() to anon,authenticated,service_role;

create function place_online_order(payload jsonb,client_bucket text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare setting online_store_settings; old online_orders; oid uuid; token uuid; number text; line jsonb; p products; q integer; subtotal bigint:=0; fee bigint; tax bigint; rate integer; total bigint; request_fingerprint text; hits_now integer;
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
 fee:=case when payload->>'fulfillment'='delivery' then setting.delivery_fee_sen else 0 end;
 select tax_bps into strict rate from system_settings where branch_id=setting.branch_id;
 tax:=((subtotal+fee)*rate+5000)/10000;total:=subtotal+fee+tax;
 if coalesce((payload->>'expected_total_sen')::bigint,-1)<>total then raise exception 'Prices or delivery charges changed. Refresh your basket before ordering.';end if;
 number:='WEB-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('online_order_sequence')::text,6,'0');
 insert into online_orders(idempotency_key,request_hash,order_number,branch_id,customer_name,phone,email,fulfillment,address,postcode,notes,payment_method,instructions,subtotal_sen,delivery_fee_sen,tax_bps,tax_sen,total_sen)
 values((payload->>'key')::uuid,request_fingerprint,number,setting.branch_id,payload->>'name',payload->>'phone',nullif(payload->>'email',''),payload->>'fulfillment',coalesce(payload->>'address',''),coalesce(payload->>'postcode',''),coalesce(payload->>'notes',''),payload->>'payment_method',jsonb_build_object('pickup_address',setting.pickup_address,'contact_phone',setting.contact_phone,'bank_name',setting.bank_name,'bank_account_name',setting.bank_account_name,'bank_account_number',setting.bank_account_number,'duitnow_qr_url',setting.duitnow_qr_url,'delivery_note',setting.delivery_note),subtotal,fee,rate,tax,total)
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

create function online_order_status(token uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('order_number',o.order_number,'status',case when o.sale_id is not null and coalesce((select sum(total_sen) from refunds where sale_id=o.sale_id),0)>=o.total_sen then 'refunded' when o.status in ('awaiting_payment','payment_submitted') and o.expires_at<=now() then 'expired' else o.status end,
 'fulfillment',o.fulfillment,'created_at',o.created_at,'expires_at',o.expires_at,'customer_name',o.customer_name,'address',o.address,'postcode',o.postcode,
 'subtotal_sen',o.subtotal_sen,'delivery_fee_sen',o.delivery_fee_sen,'tax_sen',o.tax_sen,'total_sen',o.total_sen,'payment_method',o.payment_method,'payment_reference',o.payment_reference,
 'receipt_number',(select receipt_number from sales where id=o.sale_id),'cashier_name',(select cashier_name from sales where id=o.sale_id),
 'tendered_sen',(select sum(tendered_sen) from payments where sale_id=o.sale_id),'change_sen',coalesce((select sum(tendered_sen-amount_sen) from payments where sale_id=o.sale_id),0),
 'confirmed_at',o.confirmed_at,'cancellation_reason',o.cancellation_reason,
 'items',(select jsonb_agg(jsonb_build_object('sku',oi.sku,'name',oi.name,'quantity',oi.quantity,'unit_price_sen',oi.unit_price_sen,'total_sen',oi.total_sen,'refunded_quantity',coalesce((select sum(ri.quantity) from refund_items ri join sale_items si on si.id=ri.sale_item_id where si.sale_id=o.sale_id and si.product_id=oi.product_id),0)) order by oi.sku) from online_order_items oi where oi.order_id=o.id),
 'refunded_sen',coalesce((select sum(total_sen) from refunds where sale_id=o.sale_id),0),
 'store',o.instructions)
 from online_orders o where o.tracking_token=token
$$;
revoke all on function online_order_status(uuid) from public,anon,authenticated;
grant execute on function online_order_status(uuid) to service_role;

create function submit_online_payment(token uuid,reference text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid; previous text;
begin
 if length(trim(reference)) not between 3 and 150 then raise exception 'Enter the payment reference';end if;
 select id,payment_reference into strict oid,previous from online_orders where tracking_token=token and status in ('awaiting_payment','payment_submitted') and payment_method in ('bank','duitnow') and expires_at>now() for update;
 if previous is not null then
  if previous=trim(reference) then return;end if;
  raise exception 'Payment reference already submitted. Contact the store for corrections.';
 end if;
 update online_orders set payment_reference=trim(reference),status='payment_submitted' where id=oid;
 insert into online_order_events(order_id,event) values(oid,'Customer submitted payment reference; awaiting staff verification');
end$$;
revoke all on function submit_online_payment(uuid,text) from public,anon,authenticated;
grant execute on function submit_online_payment(uuid,text) to service_role;

create function manage_online_order(action text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
  if o.status not in ('awaiting_payment','payment_submitted') or o.expires_at<=now() then raise exception 'Order has expired or was cancelled. Recheck stock and create a new order.';end if;
  if o.payment_method<>'cash' and (o.payment_reference is null or length(trim(coalesce(payload->>'reference','')))<3) then raise exception 'Verify funds received and enter the bank/payment reference';end if;
  perform 1 from inventory where branch_id=o.branch_id and product_id in(select product_id from online_order_items where order_id=o.id) order by product_id for update;
  -- Release this reservation inside the transaction, then deduct physical inventory.
  update online_orders set status='paid' where id=o.id;
  insert into customers(name,phone,email,marketing_consent) values(o.customer_name,o.phone,o.email,false) returning id into customer;
  insert into sales(idempotency_key,receipt_number,cashier_name,branch_id,cashier_id,session_id,customer_id,subtotal_sen,discount_sen,tax_sen,total_sen)
  values(o.idempotency_key,'CHIP-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('receipt_sequence')::text,6,'0'),(select display_name from profiles where id=auth.uid()),o.branch_id,auth.uid(),sess,customer,o.subtotal_sen+o.delivery_fee_sen,0,o.tax_sen,o.total_sen) returning id into sid;
  for r in select * from online_order_items where order_id=o.id order by product_id loop
   select c.cost_sen into strict current_cost from products p join product_costs c on c.product_id=p.id where p.id=r.product_id for share of p,c;
   insert into sale_items(sale_id,product_id,sku,name,category_name,quantity,unit_price_sen,discount_sen,total_sen) values(sid,r.product_id,r.sku,r.name,r.category_name,r.quantity,r.unit_price_sen,0,r.total_sen) returning id into itemid;
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
end$$;
revoke all on function manage_online_order(text,jsonb) from public,anon;
grant execute on function manage_online_order(text,jsonb) to authenticated;
-- Delivery lines are non-stock service items; existing product sale lines retain FKs.
alter table sale_items alter column product_id drop not null;

-- Keep the established retail RPC as a private implementation; the public wrapper
-- ensures a delivery-fee refund can never create sellable inventory.
alter function retail_action(text,jsonb) rename to retail_action_before_shop;
revoke all on function retail_action_before_shop(text,jsonb) from public,anon,authenticated;
create function retail_action(action text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform require_role(array['owner','manager','cashier']);
 if action='refund' and exists(select 1 from sale_items where id=(payload->>'sale_item_id')::uuid and product_id is null) then
  payload:=jsonb_set(payload,'{restock}','false'::jsonb);
 end if;
 return retail_action_before_shop(action,payload);
end$$;
revoke all on function retail_action(text,jsonb) from public,anon;
grant execute on function retail_action(text,jsonb) to authenticated;

create function shop_allow_request(client_bucket text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if client_bucket is null or length(client_bucket)<>64 then return false;end if;
 delete from shop_rate_limits where window_start<now()-interval '2 days';
 insert into shop_rate_limits(bucket,window_start,hits) values('http:'||client_bucket,now(),1)
 on conflict(bucket) do update set hits=case when shop_rate_limits.window_start<now()-interval '1 hour' then 1 else shop_rate_limits.hits+1 end,
 window_start=case when shop_rate_limits.window_start<now()-interval '1 hour' then now() else shop_rate_limits.window_start end returning hits into n;
 return n<=20;
end$$;
revoke all on function shop_allow_request(text) from public,anon,authenticated;
grant execute on function shop_allow_request(text) to service_role;

revoke all on sequence online_order_sequence from public,anon,authenticated;
commit;
