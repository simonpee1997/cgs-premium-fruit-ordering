-- Both channels share one quota under the same promotion row lock.
begin;
alter table sale_items add column english_name text;
alter table sales add column promo_code text, add column promotion_discount_sen bigint not null default 0 check(promotion_discount_sen>=0), add column promotion_snapshot jsonb not null default '{}';
create table pos_promotion_redemptions (
 id uuid primary key default gen_random_uuid(),promotion_id uuid not null references promotions,
 promotion_version integer not null,branch_id uuid not null references branches,sale_id uuid unique not null references sales,
 code text not null,promotion_name text not null,discount_sen bigint not null check(discount_sen>0),
 product_subtotal_sen bigint not null check(product_subtotal_sen>=discount_sen),snapshot jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(promotion_id,promotion_version) references promotion_revisions(promotion_id,version)
);
alter table pos_promotion_redemptions enable row level security;
revoke all on pos_promotion_redemptions from public,anon,authenticated;
grant select on pos_promotion_redemptions to authenticated;
create policy owner_pos_promotion_redemptions on pos_promotion_redemptions for select to authenticated using(staff_role()='owner' and branch_id=staff_branch());

create function capture_sale_english_name() returns trigger language plpgsql security definer set search_path=public,pg_temp as $capture_names$
begin
 if new.product_id is not null then
  select i.english_name into new.english_name from online_order_items i join online_orders o on o.id=i.order_id join sales s on s.id=new.sale_id and s.idempotency_key=o.idempotency_key where i.product_id=new.product_id and i.name=new.name;
  if new.english_name is null then select nullif(trim(p.english_name),'') into new.english_name from products p where p.id=new.product_id and p.name=new.name;end if;
 end if;
 return new;
end $capture_names$;
create trigger capture_sale_english_name before insert on sale_items for each row execute function capture_sale_english_name();
revoke all on function capture_sale_english_name() from public,anon,authenticated,service_role;

create function checkout_with_validated_code(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare sid uuid; sess uuid; line jsonb; pay jsonb; p products; q integer; base bigint; itemdiscount bigint; subtotal bigint:=0; itemdiscounts bigint:=0; orderdiscount bigint; tax bigint; total bigint; paid bigint:=0; amount bigint; tendered bigint; settings system_settings; itemid uuid; promo integer:=0; discountvalue bigint; kind text;
begin
 perform require_role(array['owner','manager','cashier']);
 perform pg_advisory_xact_lock(hashtextextended(payload->>'key',0));
 select id into sid from sales where idempotency_key=(payload->>'key')::uuid and cashier_id=auth.uid();if sid is not null then return sid;end if;
 select id into sess from cashier_sessions where cashier_id=auth.uid() and branch_id=staff_branch() and status='open' for update;if sess is null then raise exception 'Open a cashier session first';end if;
 if jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'Invalid cart';end if;
 if (select count(*) from jsonb_array_elements(payload->'items'))<>(select count(distinct value->>'product_id') from jsonb_array_elements(payload->'items')) then raise exception 'Duplicate products';end if;
 select * into settings from system_settings where branch_id=staff_branch();
 -- Consistent lock ordering prevents deadlocks across multi-product carts.
 perform 1 from inventory where branch_id=staff_branch() and product_id in(select (value->>'product_id')::uuid from jsonb_array_elements(payload->'items')) order by product_id for update;
 for line in select value from jsonb_array_elements(payload->'items') loop
 select * into strict p from products where id=(line->>'product_id')::uuid and not archived for share;
 q:=(line->>'quantity')::integer;if q not between 1 and 10000 then raise exception 'Invalid quantity';end if;
 if not exists(select 1 from inventory where branch_id=staff_branch() and product_id=p.id and quantity>=q) then raise exception 'Insufficient stock for %',p.sku;end if;
 base:=p.price_sen*q;itemdiscount:=coalesce((line->>'discount_sen')::bigint,0);if itemdiscount<0 or itemdiscount>base then raise exception 'Invalid item discount';end if;
 subtotal:=subtotal+base;itemdiscounts:=itemdiscounts+itemdiscount;if subtotal>100000000 then raise exception 'Order exceeds maximum transaction size';end if;
 end loop;
 kind:=coalesce(payload->>'discount_kind','fixed');discountvalue:=coalesce((payload->>'discount_value')::bigint,0);
 if discountvalue<0 or kind not in ('fixed','percent') or (kind='percent' and discountvalue>10000) then raise exception 'Invalid order discount';end if;
 orderdiscount:=case when kind='percent' then ((subtotal-itemdiscounts)*discountvalue+5000)/10000 else discountvalue end;
 if payload->>'promotion_id' is not null then select percent_bps into strict promo from promotions where id=(payload->>'promotion_id')::uuid and active and now() between starts_at and ends_at;orderdiscount:=orderdiscount+((subtotal-itemdiscounts)*promo+5000)/10000;end if;
 if orderdiscount<0 or orderdiscount>subtotal-itemdiscounts then raise exception 'Discount exceeds subtotal';end if;

 tax:=((subtotal-itemdiscounts-orderdiscount)*coalesce(settings.tax_bps,0)+5000)/10000;total:=subtotal-itemdiscounts-orderdiscount+tax;
 if jsonb_array_length(payload->'payments') not between 0 and 10 or (total>0 and jsonb_array_length(payload->'payments')=0) then raise exception 'Payment required';end if;
 for pay in select value from jsonb_array_elements(payload->'payments') loop
 amount:=(pay->>'amount_sen')::bigint;tendered:=coalesce((pay->>'tendered_sen')::bigint,amount);
 if amount<=0 or tendered<amount or (pay->>'method'<>'cash' and (tendered<>amount or length(trim(coalesce(pay->>'reference','')))<1)) then raise exception 'Invalid or insufficient payment';end if;paid:=paid+amount;
 end loop;
 if paid<>total then raise exception 'Payment total must equal server total (%)',total;end if;
 if (payload->>'customer_id') is not null and not exists(select 1 from customers where id=(payload->>'customer_id')::uuid) then raise exception 'Unknown customer';end if;
 insert into sales(idempotency_key,receipt_number,cashier_name,branch_id,cashier_id,session_id,customer_id,subtotal_sen,discount_sen,tax_sen,total_sen) values((payload->>'key')::uuid,'CHIP-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('receipt_sequence')::text,6,'0'),(select display_name from profiles where id=auth.uid()),staff_branch(),auth.uid(),sess,(payload->>'customer_id')::uuid,subtotal,itemdiscounts+orderdiscount,tax,total) returning id into sid;
 for line in select value from jsonb_array_elements(payload->'items') loop
 select * into strict p from products where id=(line->>'product_id')::uuid;q:=(line->>'quantity')::integer;itemdiscount:=coalesce((line->>'discount_sen')::bigint,0);
 insert into sale_items(sale_id,product_id,sku,name,quantity,unit_price_sen,discount_sen,total_sen) values(sid,p.id,p.sku,p.name,q,p.price_sen,itemdiscount,p.price_sen*q-itemdiscount) returning id into itemid;
 insert into sale_item_costs values(itemid,(select cost_sen from product_costs where product_id=p.id));
 update inventory set quantity=quantity-q where branch_id=staff_branch() and product_id=p.id;
 insert into stock_movements(branch_id,product_id,quantity,movement_type,staff_id,reference_id,reason) values(staff_branch(),p.id,-q,'sale',auth.uid(),sid,'Checkout');end loop;
 for pay in select value from jsonb_array_elements(payload->'payments') loop insert into payments(sale_id,method,amount_sen,tendered_sen,reference) values(sid,pay->>'method',(pay->>'amount_sen')::bigint,coalesce((pay->>'tendered_sen')::bigint,(pay->>'amount_sen')::bigint),pay->>'reference');end loop;
 insert into audit_logs(staff_id,action,entity_id) values(auth.uid(),'checkout',sid);return sid;
end$$;

revoke all on function checkout_with_validated_code(jsonb) from public,anon,authenticated,service_role;
-- Preserve all ordinary POS transactions through the original implementation.
alter function checkout(jsonb) rename to checkout_before_codes;
revoke all on function checkout_before_codes(jsonb) from public,anon,authenticated,service_role;
create function pos_promotion_quote(payload jsonb) returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $pos_quote$
declare p promotions;cart jsonb;begin
 perform require_role(array['owner','manager','cashier']);
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('code','items','customer_id')) then raise exception 'Client prices and discounts are not accepted';end if;
 select * into p from promotions where code=upper(trim(payload->>'code')) and branch_id=staff_branch();
 if not found then raise exception 'Invalid promo code';end if;
 cart:=promotion_priced_cart(payload->'items');
 return evaluate_promotion(p.id,cart,clock_timestamp(),false,0)-'snapshot';
end $pos_quote$;
revoke all on function pos_promotion_quote(jsonb) from public,anon,service_role;
grant execute on function pos_promotion_quote(jsonb) to authenticated;

create function checkout(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $coded_checkout$
declare p promotions;s sales;sid uuid;session_id uuid;quote jsonb;cart jsonb;clean jsonb;amount bigint;begin
 if nullif(trim(payload->>'promo_code'),'') is null then return checkout_before_codes(payload);end if;
 perform require_role(array['owner','manager','cashier']);
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('key','customer_id','items','discount_kind','discount_value','promotion_id','payments','promo_code')) then raise exception 'Client prices and discounts are not accepted';end if;
 if coalesce((payload->>'discount_value')::bigint,0)<>0 or nullif(payload->>'promotion_id','') is not null or exists(select 1 from jsonb_array_elements(payload->'items') l where coalesce((l->>'discount_sen')::bigint,0)<>0) then raise exception 'Promo codes cannot be combined with other discounts';end if;
 if exists(select 1 from jsonb_array_elements(payload->'items') l,jsonb_object_keys(l) k where k not in ('product_id','quantity','discount_sen')) then raise exception 'Client prices and discounts are not accepted';end if;
 perform pg_advisory_xact_lock(hashtextextended(payload->>'key',0));
 select * into s from sales where idempotency_key=(payload->>'key')::uuid;
 if found then
  if s.branch_id<>staff_branch() or s.cashier_id<>auth.uid() then raise exception 'Checkout request is unavailable';end if;
  return s.id;
 end if;
 select id into session_id from cashier_sessions where cashier_id=auth.uid() and branch_id=staff_branch() and status='open' for update;
 if session_id is null then raise exception 'Open a cashier session before checkout';end if;
 select * into p from promotions where code=upper(trim(payload->>'promo_code')) and branch_id=staff_branch() for update;
 if not found then raise exception 'Invalid promo code';end if;
 perform 1 from inventory where branch_id=staff_branch() and product_id in(select (value->>'product_id')::uuid from jsonb_array_elements(payload->'items')) order by product_id for update;
 perform 1 from products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(payload->'items')) order by id for share;
 select jsonb_agg(value-'discount_sen') into cart from jsonb_array_elements(payload->'items');
 quote:=evaluate_promotion(p.id,promotion_priced_cart(cart),clock_timestamp(),false,0);
 amount:=(quote->>'discount_sen')::bigint;
 clean:=(payload-'promo_code'-'promotion_id')||jsonb_build_object('discount_kind','fixed','discount_value',amount);
 sid:=checkout_with_validated_code(clean);
 -- The quoted snapshot and actual paid amount must agree before quota is consumed.
 select * into strict s from sales where id=sid;
 if s.subtotal_sen<>(quote->>'product_subtotal_sen')::bigint or s.discount_sen<>amount or coalesce((select sum(amount_sen) from payments where sale_id=sid),0)<>s.total_sen then raise exception 'Promotion sale/payment mismatch';end if;
 if promotion_effective_status(p,clock_timestamp())<>'Active' then raise exception 'Promotion expired or exhausted while waiting';end if;
 update sales set promo_code=p.code,promotion_discount_sen=amount,promotion_snapshot=quote->'snapshot' where id=sid;
 insert into pos_promotion_redemptions(promotion_id,promotion_version,branch_id,sale_id,code,promotion_name,discount_sen,product_subtotal_sen,snapshot)
 values(p.id,p.version,p.branch_id,sid,p.code,p.name,amount,s.subtotal_sen,quote->'snapshot');
 return sid;
end $coded_checkout$;
revoke all on function checkout(jsonb) from public,anon,service_role;
grant execute on function checkout(jsonb) to authenticated;

-- Use actual database names for legacy online receipts as well as new snapshots.
alter function online_order_status(uuid) rename to online_order_status_before_bilingual;
revoke all on function online_order_status_before_bilingual(uuid) from public,anon,authenticated,service_role;
create function online_order_status(token uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $bilingual_status$
 select online_order_status_before_bilingual(token)||jsonb_build_object('items',(select jsonb_agg(j.item||jsonb_build_object('english_name',coalesce(nullif(trim(i.english_name),''),case when p.name=i.name then nullif(trim(p.english_name),'') end)) order by j.ordinality) from jsonb_array_elements(online_order_status_before_bilingual(token)->'items') with ordinality j(item,ordinality) join online_orders o on o.tracking_token=token join online_order_items i on i.order_id=o.id and i.sku=j.item->>'sku' left join products p on p.id=i.product_id))
$bilingual_status$;
revoke all on function online_order_status(uuid) from public,anon,authenticated;
grant execute on function online_order_status(uuid) to service_role;

-- Advertise only after the transaction has installed both checkout paths.
create or replace function shop_catalogue() returns jsonb language sql stable security definer set search_path=public,pg_temp as $promotion_catalogue$
 select jsonb_set(jsonb_set(shop_catalogue_before_nationwide(),'{store,free_delivery_all_postcodes}','true'::jsonb),'{store,promotions_available}','true'::jsonb)
$promotion_catalogue$;
revoke all on function shop_catalogue() from public;
grant execute on function shop_catalogue() to anon,authenticated,service_role;
create or replace function promotion_effective_status(p promotions,at_time timestamptz) returns text language sql stable security definer set search_path=public,pg_temp as $promotion_effective_status$
 select case
 when p.publication_status='draft' then 'Draft'
 when p.publication_status='paused' then 'Paused'
 when p.publication_status='ended' or at_time is null or at_time>p.ends_at then 'Expired'
 when p.publication_status is distinct from 'published' then 'Draft'
 when at_time<p.starts_at then 'Scheduled'
 when p.max_redemptions is not null and (select count(*) from promotion_redemptions r where r.promotion_id=p.id and (r.state='redeemed' or (r.state='reserved' and r.expires_at>at_time)))+(select count(*) from pos_promotion_redemptions r where r.promotion_id=p.id)>=p.max_redemptions then 'Redemption Limit Reached'
 when p.publication_status='published' and at_time between p.starts_at and p.ends_at then 'Active'
 else 'Expired' end
$promotion_effective_status$;


create function capture_online_sale_promotion() returns trigger language plpgsql security definer set search_path=public,pg_temp as $sale_promotion$
declare o online_orders;begin
 select * into o from online_orders where idempotency_key=new.idempotency_key and branch_id=new.branch_id;
 if found and o.promo_code is not null then new.promo_code:=o.promo_code;new.promotion_discount_sen:=o.promotion_discount_sen;new.promotion_snapshot:=o.promotion_snapshot;end if;
 return new;
end $sale_promotion$;
create trigger capture_online_sale_promotion before insert on sales for each row execute function capture_online_sale_promotion();
revoke all on function capture_online_sale_promotion() from public,anon,authenticated,service_role;

alter function promotion_dashboard() rename to promotion_dashboard_online;
revoke all on function promotion_dashboard_online() from public,anon,authenticated,service_role;
create function promotion_dashboard() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $combined_dashboard$
declare result jsonb;offers jsonb:='[]';offer jsonb;stats record;extra jsonb;begin
 result:=promotion_dashboard_online();
 for offer in select value from jsonb_array_elements(result->'offers') loop
  select count(*) uses,coalesce(sum(r.discount_sen),0) discounts,coalesce(sum(s.total_sen),0) gross,coalesce(sum(s.total_sen-coalesce((select sum(f.total_sen) from refunds f where f.sale_id=s.id),0)),0) net into stats from pos_promotion_redemptions r join sales s on s.id=r.sale_id where r.promotion_id=(offer->>'id')::uuid and r.branch_id=staff_branch();
  offers:=offers||jsonb_build_array(offer||jsonb_build_object('redemptions',(offer->>'redemptions')::bigint+stats.uses,'total_discount_sen',(offer->>'total_discount_sen')::bigint+stats.discounts,'associated_sales_sen',(offer->>'associated_sales_sen')::bigint+stats.gross,'net_sales_sen',(offer->>'net_sales_sen')::bigint+stats.net));
 end loop;
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('state','redeemed','order_id',null,'order_number',s.receipt_number,'expires_at',null,'sale_total_sen',s.total_sen,'refund_sen',coalesce((select sum(f.total_sen) from refunds f where f.sale_id=s.id),0)) order by r.created_at desc),'[]'::jsonb) into extra from pos_promotion_redemptions r join sales s on s.id=r.sale_id where r.branch_id=staff_branch();
 return result||jsonb_build_object('offers',offers,'redemptions',(result->'redemptions')||extra);
end $combined_dashboard$;
revoke all on function promotion_dashboard() from public,anon,service_role;
grant execute on function promotion_dashboard() to authenticated;

-- The merchant explicitly requested this code to be active for anyone given it.
-- Seeded identity/configuration only; existing legacy offers remain untouched.
update promotions set publication_status='published' where id='80000000-2026-4000-8000-000000000020' and code='CGSVIP20' and publication_status='draft' and percent_bps=2000 and ends_at='2026-12-31 23:59:59.999999+08'::timestamptz;

commit;
