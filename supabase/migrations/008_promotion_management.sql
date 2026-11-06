begin;
do $$begin
 if to_regclass('public.payment_proofs') is null then raise exception 'STOP: Apply migrations through 007 first in CHIPSTI POS.';end if;
 if not exists(select 1 from businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then raise exception 'STOP: This is not CHIPSTI POS.';end if;
end$$;

-- Extend the existing table. Uncoded POS offers and their original calculations
-- are preserved. Coded offers cannot accidentally enter the legacy POS path.
alter table promotions add column code text,
 add column branch_id uuid references branches,
 add column discount_type text not null default 'percent' check(discount_type in ('percent','fixed')),
 add column fixed_discount_sen bigint not null default 0 check(fixed_discount_sen between 0 and 100000000),
 add column publication_status text not null default 'draft' check(publication_status in ('draft','published','paused','ended')),
 add column minimum_spend_sen bigint not null default 0 check(minimum_spend_sen between 0 and 100000000),
 add column discount_cap_sen bigint check(discount_cap_sen between 1 and 100000000),
 add column max_redemptions integer check(max_redemptions between 1 and 1000000000),
 add column eligible_product_ids uuid[] not null default '{}', add column eligible_category_ids uuid[] not null default '{}',
 add column excluded_product_ids uuid[] not null default '{}', add column excluded_category_ids uuid[] not null default '{}',
 add column allow_manual_stacking boolean not null default false,
 add column version integer not null default 1,
 add column created_at timestamptz not null default now(),
 add constraint coded_promotion_safety check(code is null or (branch_id is not null and not active and code~'^[A-Z0-9][A-Z0-9_-]{2,31}$'));
create unique index promotions_unique_code on promotions(upper(code)) where code is not null;

create table promotion_revisions (
 promotion_id uuid not null references promotions on delete cascade,version integer not null,
 branch_id uuid not null references branches,snapshot jsonb not null,changed_by uuid references profiles,
 created_at timestamptz not null default now(),primary key(promotion_id,version)
);
create table promotion_redemptions (
 id uuid primary key default gen_random_uuid(),promotion_id uuid not null references promotions,
 branch_id uuid not null references branches,order_id uuid unique not null references online_orders,
 sale_id uuid unique references sales,code text not null,promotion_name text not null,promotion_version integer not null,
 discount_sen bigint not null check(discount_sen>=0),product_subtotal_sen bigint not null check(product_subtotal_sen>=discount_sen),
 eligible_subtotal_sen bigint not null check(eligible_subtotal_sen>=discount_sen),snapshot jsonb not null,
 state text not null default 'reserved' check(state in ('reserved','redeemed','released')),
 created_at timestamptz not null default now(),expires_at timestamptz not null
);
alter table promotion_redemptions add foreign key(promotion_id,promotion_version) references promotion_revisions(promotion_id,version);
create index promotion_usage_idx on promotion_redemptions(promotion_id,state,expires_at);
alter table promotion_revisions enable row level security;
alter table promotion_redemptions enable row level security;
revoke all on promotion_revisions,promotion_redemptions from public,anon,authenticated;
grant select on promotion_revisions,promotion_redemptions to authenticated;
create policy owner_promotion_revisions on promotion_revisions for select to authenticated using(staff_role()='owner' and branch_id=staff_branch());
create policy owner_promotion_redemptions on promotion_redemptions for select to authenticated using(staff_role()='owner' and branch_id=staff_branch());
drop policy read_promotions on promotions;
create policy read_promotions on promotions for select to authenticated using(staff_role() is not null and (code is null or (staff_role()='owner' and branch_id=staff_branch())));

create function validate_promotion_config() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if TG_OP='UPDATE' and old.code is not null and new.code is null then raise exception 'A promo code cannot become a legacy POS offer';end if;
 if new.code is null then return new;end if;
 new.code:=upper(trim(new.code));new.name:=trim(new.name);new.active:=false;
 if length(new.name) not between 1 and 150 then raise exception 'Enter a promotion name';end if;
 if (new.discount_type='percent' and new.percent_bps not between 1 and 10000) or (new.discount_type='fixed' and new.fixed_discount_sen<1) then raise exception 'Discount must be greater than zero and at most 100 percent';end if;
 if greatest(cardinality(new.eligible_product_ids),cardinality(new.excluded_product_ids),cardinality(new.eligible_category_ids),cardinality(new.excluded_category_ids))>100 then raise exception 'Maximum 100 selections per eligibility list';end if;
 if exists(select 1 from unnest(new.eligible_product_ids||new.excluded_product_ids) x where not exists(select 1 from products where id=x)) or exists(select 1 from unnest(new.eligible_category_ids||new.excluded_category_ids) x where not exists(select 1 from product_categories where id=x)) then raise exception 'Unknown eligible product or category';end if;
 if TG_OP='UPDATE' then new.version:=old.version+1;end if;new.updated_at:=now();return new;
end$$;
create trigger promotion_config before insert or update on promotions for each row execute function validate_promotion_config();
create function snapshot_promotion_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.code is not null then insert into promotion_revisions(promotion_id,version,branch_id,snapshot,changed_by) values(new.id,new.version,new.branch_id,to_jsonb(new),auth.uid());end if;return new;
end$$;
create trigger promotion_revision after insert or update on promotions for each row execute function snapshot_promotion_revision();
revoke all on function validate_promotion_config(),snapshot_promotion_revision() from public,anon,authenticated,service_role;

create function promotion_effective_status(p promotions,at_time timestamptz) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select case when p.publication_status='draft' then 'Draft' when p.publication_status='ended' or at_time>p.ends_at then 'Expired'
 when p.publication_status='paused' then 'Paused' when at_time<p.starts_at then 'Scheduled'
 when p.max_redemptions is not null and (select count(*) from promotion_redemptions r where r.promotion_id=p.id and (r.state='redeemed' or (r.state='reserved' and r.expires_at>at_time)))>=p.max_redemptions then 'Redemption Limit Reached' else 'Active' end
$$;
revoke all on function promotion_effective_status(promotions,timestamptz) from public,anon,authenticated,service_role;

-- Convert only IDs/quantities into a trusted priced cart. Public callers never
-- provide unit prices, eligibility category IDs, time or discount amounts.
create function promotion_priced_cart(items jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare line jsonb;p products;q integer;result jsonb:='[]';subtotal bigint:=0;
begin
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 50 then raise exception 'Invalid promotion basket';end if;
 if (select count(*) from jsonb_array_elements(items))<>(select count(distinct value->>'product_id') from jsonb_array_elements(items)) then raise exception 'Duplicate products';end if;
 for line in select value from jsonb_array_elements(items) loop
  select * into strict p from products where id=(line->>'product_id')::uuid and not archived;
  q:=(line->>'quantity')::integer;if q not between 1 and 100 then raise exception 'Invalid quantity';end if;
  subtotal:=subtotal+p.price_sen*q;if subtotal>100000000 then raise exception 'Basket amount exceeds limit';end if;
  result:=result||jsonb_build_array(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',q,'unit_price_sen',p.price_sen,'discount_sen',0));
 end loop;return result;
end$$;
revoke all on function promotion_priced_cart(jsonb) from public,anon,authenticated,service_role;

create function evaluate_promotion(offer_id uuid,cart jsonb,at_time timestamptz,preview_draft boolean default false,manual_discount_sen bigint default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p promotions;line jsonb;base bigint;line_discount bigint;subtotal bigint:=0;eligible bigint:=0;line_discounts bigint:=0;amount bigint;status text;
begin
 select * into strict p from promotions where id=offer_id and code is not null;
 status:=promotion_effective_status(p,at_time);
 if status<>'Active' and not (preview_draft and status='Draft' and at_time between p.starts_at and p.ends_at) then raise exception 'Promotion is %',status;end if;
 if manual_discount_sen is null or manual_discount_sen<0 then raise exception 'Invalid manual discount';end if;
 for line in select value from jsonb_array_elements(cart) loop
  base:=(line->>'unit_price_sen')::bigint*(line->>'quantity')::integer;
  line_discount:=coalesce((line->>'discount_sen')::bigint,0);
  if base<0 or line_discount<0 or line_discount>base then raise exception 'Invalid priced cart';end if;
  subtotal:=subtotal+base-line_discount;line_discounts:=line_discounts+line_discount;
  if (cardinality(p.eligible_product_ids)+cardinality(p.eligible_category_ids)=0 or (line->>'product_id')::uuid=any(p.eligible_product_ids) or (line->>'category_id')::uuid=any(p.eligible_category_ids))
   and not ((line->>'product_id')::uuid=any(p.excluded_product_ids)) and not coalesce((line->>'category_id')::uuid=any(p.excluded_category_ids),false) then eligible:=eligible+base-line_discount;end if;
 end loop;
 if subtotal>100000000 or manual_discount_sen>subtotal then raise exception 'Invalid basket amount or manual discount';end if;
 if not p.allow_manual_stacking and (manual_discount_sen>0 or line_discounts>0) then raise exception 'This promotion cannot be stacked with other discounts';end if;
 if subtotal-manual_discount_sen<p.minimum_spend_sen then raise exception 'Minimum product spending has not been reached';end if;
 if eligible=0 then raise exception 'No eligible products in this basket';end if;
 if manual_discount_sen>0 then eligible:=eligible-(eligible*manual_discount_sen+subtotal/2)/subtotal;end if;
 amount:=case when p.discount_type='percent' then (eligible*p.percent_bps+5000)/10000 else p.fixed_discount_sen end;
 amount:=least(eligible,amount,coalesce(p.discount_cap_sen,amount));
 return jsonb_build_object('promotion_id',p.id,'code',p.code,'name',p.name,'version',p.version,'discount_type',p.discount_type,'percent_bps',p.percent_bps,'fixed_discount_sen',p.fixed_discount_sen,
 'product_subtotal_sen',subtotal,'eligible_subtotal_sen',eligible,'discount_sen',amount,'subtotal_after_discount_sen',subtotal-manual_discount_sen-amount,
 'snapshot',jsonb_build_object('code',p.code,'name',p.name,'version',p.version,'discount_type',p.discount_type,'percent_bps',p.percent_bps,'fixed_discount_sen',p.fixed_discount_sen,'minimum_spend_sen',p.minimum_spend_sen,'discount_cap_sen',p.discount_cap_sen,'starts_at',p.starts_at,'ends_at',p.ends_at,'allow_manual_stacking',p.allow_manual_stacking));
end$$;
revoke all on function evaluate_promotion(uuid,jsonb,timestamptz,boolean,bigint) from public,anon,authenticated,service_role;

create function shop_promotion_quote(promo_code text,items jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare id uuid;begin
 select p.id into id from promotions p where p.code=upper(trim(promo_code)) and p.branch_id='20000000-0000-0000-0000-000000000001';
 if id is null then raise exception 'Invalid promo code';end if;
 return evaluate_promotion(id,promotion_priced_cart(items),now(),false,0)-'snapshot';
end$$;
revoke all on function shop_promotion_quote(text,jsonb) from public,anon,authenticated;
grant execute on function shop_promotion_quote(text,jsonb) to service_role;

create function promotion_generate_code() returns text language plpgsql volatile security definer set search_path=public,pg_temp as $$declare candidate text;begin
 perform require_role(array['owner']);loop candidate:='CHIP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));exit when not exists(select 1 from promotions p where p.code=candidate);end loop;return candidate;
end$$;
revoke all on function promotion_generate_code() from public,anon,service_role;
grant execute on function promotion_generate_code() to authenticated;

create function manage_promotion(operation text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p promotions;result uuid;target uuid;state text;begin
 perform require_role(array['owner']);
 target:=(payload->>'id')::uuid;
 if target is not null then
  select * into strict p from promotions where id=target and code is not null and branch_id=staff_branch() for update;
  if coalesce((payload->>'expected_version')::integer,-1)<>p.version then raise exception 'This offer changed. Refresh before saving.';end if;
 end if;
 if operation='save' then
  if (payload->>'publish')::boolean and (payload->>'ends_at')::timestamptz<now() then raise exception 'Cannot publish an already expired offer';end if;
  if target is null then result:=gen_random_uuid();else result:=target;end if;
  state:=case when coalesce((payload->>'publish')::boolean,false) and coalesce(p.publication_status,'draft')='draft' then 'published' else coalesce(p.publication_status,'draft') end;
  insert into promotions(id,branch_id,name,code,percent_bps,starts_at,ends_at,active,discount_type,fixed_discount_sen,publication_status,minimum_spend_sen,discount_cap_sen,max_redemptions,eligible_product_ids,eligible_category_ids,excluded_product_ids,excluded_category_ids,allow_manual_stacking)
  values(result,staff_branch(),payload->>'name',payload->>'code',case when payload->>'discount_type'='percent' then (payload->>'percent_bps')::integer else 0 end,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,false,payload->>'discount_type',case when payload->>'discount_type'='fixed' then (payload->>'fixed_discount_sen')::bigint else 0 end,state,
  (payload->>'minimum_spend_sen')::bigint,(payload->>'discount_cap_sen')::bigint,(payload->>'max_redemptions')::integer,
  array(select jsonb_array_elements_text(payload->'eligible_product_ids'))::uuid[],array(select jsonb_array_elements_text(payload->'eligible_category_ids'))::uuid[],array(select jsonb_array_elements_text(payload->'excluded_product_ids'))::uuid[],array(select jsonb_array_elements_text(payload->'excluded_category_ids'))::uuid[],coalesce((payload->>'allow_manual_stacking')::boolean,false))
  on conflict(id) do update set name=excluded.name,code=excluded.code,percent_bps=excluded.percent_bps,starts_at=excluded.starts_at,ends_at=excluded.ends_at,discount_type=excluded.discount_type,fixed_discount_sen=excluded.fixed_discount_sen,publication_status=excluded.publication_status,minimum_spend_sen=excluded.minimum_spend_sen,discount_cap_sen=excluded.discount_cap_sen,max_redemptions=excluded.max_redemptions,eligible_product_ids=excluded.eligible_product_ids,eligible_category_ids=excluded.eligible_category_ids,excluded_product_ids=excluded.excluded_product_ids,excluded_category_ids=excluded.excluded_category_ids,allow_manual_stacking=excluded.allow_manual_stacking;
 elsif operation='duplicate' then
  if target is null then raise exception 'Choose an offer';end if;result:=gen_random_uuid();
  insert into promotions(id,branch_id,name,code,percent_bps,starts_at,ends_at,active,discount_type,fixed_discount_sen,publication_status,minimum_spend_sen,discount_cap_sen,max_redemptions,eligible_product_ids,eligible_category_ids,excluded_product_ids,excluded_category_ids,allow_manual_stacking)
  values(result,p.branch_id,left('Copy of '||p.name,150),promotion_generate_code(),p.percent_bps,greatest(now(),p.starts_at),case when p.ends_at<=now() then now()+interval '7 days' else p.ends_at end,false,p.discount_type,p.fixed_discount_sen,'draft',p.minimum_spend_sen,p.discount_cap_sen,p.max_redemptions,p.eligible_product_ids,p.eligible_category_ids,p.excluded_product_ids,p.excluded_category_ids,p.allow_manual_stacking);
 else
  if target is null then raise exception 'Choose an offer';end if;result:=target;
  if operation='delete_draft' then
   if p.publication_status<>'draft' or exists(select 1 from promotion_redemptions where promotion_id=target) then raise exception 'Only an unused draft can be deleted';end if;
   delete from promotions where id=target;
  elsif operation in ('publish','resume') then
   if (operation='publish' and p.publication_status<>'draft') or (operation='resume' and p.publication_status<>'paused') or p.ends_at<now() then raise exception 'This offer cannot be published or resumed';end if;
   update promotions set publication_status='published' where id=target;
  elsif operation='pause' then
   if p.publication_status<>'published' then raise exception 'Only a published offer can be paused';end if;update promotions set publication_status='paused' where id=target;
  elsif operation='end' then
   if p.publication_status not in ('published','paused') then raise exception 'Only a published or paused offer can be ended';end if;update promotions set publication_status='ended' where id=target;
  else raise exception 'Unknown promotion action';end if;
 end if;
 insert into audit_logs(staff_id,action,entity_id,details) values(auth.uid(),'promotion:'||operation,result,jsonb_build_object('code',coalesce(payload->>'code',p.code)));
 return result;
end$$;
revoke all on function manage_promotion(text,jsonb) from public,anon,service_role;
grant execute on function manage_promotion(text,jsonb) to authenticated;

create function promotion_simulate(payload jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare id uuid;result jsonb;at_time timestamptz:=coalesce((payload->>'at')::timestamptz,now());begin
 perform require_role(array['owner']);
 select p.id into id from promotions p where p.code=upper(trim(payload->>'code')) and p.branch_id=staff_branch();if id is null then raise exception 'Invalid promo code';end if;
 result:=evaluate_promotion(id,promotion_priced_cart(payload->'items'),at_time,coalesce((payload->>'preview_draft')::boolean,false),coalesce((payload->>'manual_discount_sen')::bigint,0));
 return result||jsonb_build_object('simulation_only',true,'at',at_time);
end$$;
revoke all on function promotion_simulate(jsonb) from public,anon,service_role;
grant execute on function promotion_simulate(jsonb) to authenticated;

create function promotion_dashboard() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 perform require_role(array['owner']);
 return jsonb_build_object('server_time',now(),'offers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('status',promotion_effective_status(p,now()),
 'redemptions',(select count(*) from promotion_redemptions r where r.promotion_id=p.id and state='redeemed'),
 'reserved',(select count(*) from promotion_redemptions r where r.promotion_id=p.id and state='reserved' and expires_at>now()),
 'total_discount_sen',coalesce((select sum(discount_sen) from promotion_redemptions r where r.promotion_id=p.id and state='redeemed'),0),
 'associated_sales_sen',coalesce((select sum(s.total_sen) from promotion_redemptions r join sales s on s.id=r.sale_id where r.promotion_id=p.id and state='redeemed'),0),
 'net_sales_sen',coalesce((select sum(s.total_sen-coalesce((select sum(total_sen) from refunds f where f.sale_id=s.id),0)) from promotion_redemptions r join sales s on s.id=r.sale_id where r.promotion_id=p.id and state='redeemed'),0)) order by p.created_at desc) from promotions p where p.code is not null and p.branch_id=staff_branch()),'[]'::jsonb),
 'redemptions',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('order_number',o.order_number,'sale_total_sen',coalesce(s.total_sen,0),'refund_sen',coalesce((select sum(total_sen) from refunds f where f.sale_id=s.id),0)) order by r.created_at desc) from promotion_redemptions r join online_orders o on o.id=r.order_id left join sales s on s.id=r.sale_id where r.branch_id=staff_branch()),'[]'::jsonb));
end$$;
revoke all on function promotion_dashboard() from public,anon,service_role;
grant execute on function promotion_dashboard() to authenticated;

-- Phase 2 integration contract. Not called by the current storefront: it must
-- first create a server-priced discounted order. This validates that exact
-- discount, delivery and tax before atomically holding a redemption slot.
create function reserve_promotion_for_order(promo_code text,order_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p promotions;o online_orders;r promotion_redemptions;cart jsonb;quote jsonb;shipping jsonb;discount bigint;expected_tax bigint;result uuid;begin
 select * into strict p from promotions where code=upper(trim(promo_code)) for update;
 select * into strict o from online_orders where id=order_id and branch_id=p.branch_id for update;
 select * into r from promotion_redemptions where promotion_redemptions.order_id=o.id;
 if found then if r.promotion_id<>p.id then raise exception 'Only one promo code per order';end if;return r.id;end if;
 if o.sale_id is not null or o.status not in ('awaiting_payment','payment_submitted') or o.expires_at<=now() then raise exception 'Order is not eligible for a new redemption';end if;
 select jsonb_agg(jsonb_build_object('product_id',i.product_id,'category_id',pr.category_id,'quantity',i.quantity,'unit_price_sen',i.unit_price_sen,'discount_sen',0)) into cart from online_order_items i join products pr on pr.id=i.product_id where i.order_id=o.id;
 if cart is null then raise exception 'Order has no products';end if;
 quote:=evaluate_promotion(p.id,cart,now(),false,0);discount:=(quote->>'discount_sen')::bigint;
 if (quote->>'product_subtotal_sen')::bigint<>o.subtotal_sen then raise exception 'Order product subtotal mismatch';end if;
 shipping:=shop_delivery_quote(o.branch_id,o.fulfillment,o.postcode,o.address,o.subtotal_sen,discount);
 expected_tax:=((o.subtotal_sen-discount+(shipping->>'fee_sen')::bigint)*o.tax_bps+5000)/10000;
 if o.delivery_fee_sen<>(shipping->>'fee_sen')::bigint or o.tax_sen<>expected_tax or o.total_sen<>o.subtotal_sen-discount+o.delivery_fee_sen+o.tax_sen then raise exception 'Order does not contain this validated promotion discount';end if;
 insert into promotion_redemptions(promotion_id,branch_id,order_id,code,promotion_name,promotion_version,discount_sen,product_subtotal_sen,eligible_subtotal_sen,snapshot,expires_at)
 values(p.id,p.branch_id,o.id,p.code,p.name,p.version,discount,o.subtotal_sen,(quote->>'eligible_subtotal_sen')::bigint,quote->'snapshot',o.expires_at) returning id into result;return result;
end$$;
revoke all on function reserve_promotion_for_order(text,uuid) from public,anon,authenticated,service_role;

create function promotion_order_lifecycle() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare r promotion_redemptions;s sales;begin
 select * into r from promotion_redemptions where order_id=new.id for update;if not found then return new;end if;
 if old.sale_id is null and new.sale_id is not null then
  select * into strict s from sales where id=new.sale_id and branch_id=new.branch_id;
  if s.discount_sen<>r.discount_sen or s.total_sen<>new.total_sen then raise exception 'Promotion discount is missing from the sale; checkout integration must preserve its snapshot';end if;
  update promotion_redemptions set state='redeemed',sale_id=new.sale_id where id=r.id;
 elsif new.status='cancelled' and new.sale_id is null then update promotion_redemptions set state='released' where id=r.id;end if;return new;
end$$;
create trigger promotion_order_lifecycle after update on online_orders for each row execute function promotion_order_lifecycle();
revoke all on function promotion_order_lifecycle() from public,anon,authenticated,service_role;

-- Repeatable owner-only setup: inspect/reconcile future settings while retaining
-- the same ID, publication state, revision history and all redemption snapshots.
create function promotion_seed_cgsvip20() returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p promotions;payload jsonb;begin
 perform require_role(array['owner']);
 select * into p from promotions where code='CGSVIP20' for update;
 if found and p.branch_id<>staff_branch() then raise exception 'CGSVIP20 belongs to another branch';end if;
 if p.id is not null and p.name='Cili Gemuk Selayang Customer Special' and p.discount_type='percent' and p.percent_bps=2000 and p.starts_at='2026-11-06 00:00+08'::timestamptz and p.ends_at='2026-11-30 23:59:59+08'::timestamptz and p.minimum_spend_sen=0 and p.discount_cap_sen is null and p.max_redemptions is null and cardinality(p.eligible_product_ids||p.eligible_category_ids||p.excluded_product_ids||p.excluded_category_ids)=0 and not p.allow_manual_stacking then return p.id;end if;
 payload:=jsonb_build_object('id',p.id,'expected_version',p.version,'name','Cili Gemuk Selayang Customer Special','code','CGSVIP20','discount_type','percent','percent_bps',2000,'fixed_discount_sen',0,'starts_at','2026-11-06T00:00:00+08:00','ends_at','2026-11-30T23:59:59+08:00','minimum_spend_sen',0,'discount_cap_sen',null,'max_redemptions',null,'eligible_product_ids','[]'::jsonb,'eligible_category_ids','[]'::jsonb,'excluded_product_ids','[]'::jsonb,'excluded_category_ids','[]'::jsonb,'allow_manual_stacking',false,'publish',false);
 return manage_promotion('save',payload);
end$$;
revoke all on function promotion_seed_cgsvip20() from public,anon,service_role;
grant execute on function promotion_seed_cgsvip20() to authenticated;

-- Initial offer is a DRAFT only: neither migration nor setup publishes it.
insert into promotions(id,branch_id,name,code,percent_bps,starts_at,ends_at,active,publication_status)
values('80000000-2026-4000-8000-000000000020','20000000-0000-0000-0000-000000000001','Cili Gemuk Selayang Customer Special','CGSVIP20',2000,'2026-11-06 00:00:00+08','2026-11-30 23:59:59+08',false,'draft')
on conflict(upper(code)) where code is not null do nothing;
commit;
