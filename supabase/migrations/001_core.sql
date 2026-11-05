begin;
create extension if not exists pgcrypto;
revoke create on schema public from public,anon,authenticated;
create table businesses(id uuid primary key default gen_random_uuid(), name text not null, ssm text not null);
create table branches(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,name text not null);
create table profiles(id uuid primary key references auth.users,display_name text not null,branch_id uuid not null references branches,role text not null check(role in ('owner','manager','cashier')),active boolean not null default true,created_at timestamptz not null default now());
create table product_categories(id uuid primary key default gen_random_uuid(),name text unique not null);
create table products(id uuid primary key default gen_random_uuid(),sku text unique not null,name text not null,english_name text,description text,barcode text unique,category_id uuid references product_categories,price_sen bigint not null check(price_sen>=0 and price_sen<=100000000),image_url text,archived boolean not null default false,low_stock integer not null default 5 check(low_stock>=0),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
-- Costs live in a separate table: RLS cannot hide individual columns.
create table product_costs(product_id uuid primary key references products,cost_sen bigint not null check(cost_sen>=0 and cost_sen<=100000000));
create table inventory(branch_id uuid references branches,product_id uuid references products,quantity integer not null default 0 check(quantity>=0),primary key(branch_id,product_id));
create table suppliers(id uuid primary key default gen_random_uuid(),name text not null,phone text,email text,notes text,created_at timestamptz not null default now());
create table customers(id uuid primary key default gen_random_uuid(),name text not null,phone text,email text,notes text,loyalty_points integer not null default 0 check(loyalty_points>=0),membership_tier text not null default 'Standard',marketing_consent boolean not null default false,created_at timestamptz not null default now());
create table cashier_sessions(id uuid primary key default gen_random_uuid(),branch_id uuid not null references branches,cashier_id uuid not null references profiles,opening_sen bigint not null check(opening_sen>=0),actual_sen bigint check(actual_sen>=0),expected_sen bigint,difference_sen bigint,status text not null default 'open' check(status in ('open','submitted','approved')),started_at timestamptz not null default now(),ended_at timestamptz,approved_by uuid references profiles,approved_at timestamptz);
create unique index one_open_session on cashier_sessions(cashier_id) where status='open';
create table cash_movements(id uuid primary key default gen_random_uuid(),session_id uuid not null references cashier_sessions,amount_sen bigint not null check(amount_sen<>0),reason text not null,staff_id uuid not null references profiles,created_at timestamptz not null default now());
create sequence receipt_sequence;
create table sales(id uuid primary key default gen_random_uuid(),idempotency_key uuid unique not null,receipt_number text unique not null,cashier_name text not null,branch_id uuid not null references branches,cashier_id uuid not null references profiles,session_id uuid not null references cashier_sessions,customer_id uuid references customers,subtotal_sen bigint not null,discount_sen bigint not null,tax_sen bigint not null default 0,total_sen bigint not null check(total_sen>=0),created_at timestamptz not null default now());
create table sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid not null references sales,product_id uuid not null references products,sku text not null,name text not null,quantity integer not null check(quantity>0),unit_price_sen bigint not null,discount_sen bigint not null default 0,total_sen bigint not null);
create table sale_item_costs(sale_item_id uuid primary key references sale_items,cost_sen bigint not null);
create table payments(id uuid primary key default gen_random_uuid(),sale_id uuid not null references sales,method text not null check(method in ('cash','duitnow','bank','debit','credit')),amount_sen bigint not null check(amount_sen>0),tendered_sen bigint not null,reference text,verification text not null default 'cashier_confirmed' check(verification='cashier_confirmed'));
create table refunds(id uuid primary key default gen_random_uuid(),sale_id uuid not null references sales,staff_id uuid not null references profiles,reason text not null,total_sen bigint not null check(total_sen>=0),tax_sen bigint not null default 0,method text not null check(method in ('cash','duitnow','bank','debit','credit')),session_id uuid references cashier_sessions,idempotency_key uuid unique not null,created_at timestamptz not null default now());
create table refund_items(id uuid primary key default gen_random_uuid(),refund_id uuid not null references refunds,sale_item_id uuid not null references sale_items,quantity integer not null check(quantity>0),amount_sen bigint not null,restock boolean not null default false);
create table stock_movements(id uuid primary key default gen_random_uuid(),branch_id uuid not null references branches,product_id uuid not null references products,quantity integer not null check(quantity<>0),movement_type text not null check(movement_type in ('sale','refund','received','stock-in','stock-out','damaged','expired','adjustment')),staff_id uuid not null references profiles,reference_id uuid,reason text not null,batch text,expires_on date,created_at timestamptz not null default now());
create table purchase_orders(id uuid primary key default gen_random_uuid(),supplier_id uuid not null references suppliers,branch_id uuid not null references branches,status text not null default 'ordered' check(status in ('ordered','received','cancelled')),staff_id uuid not null references profiles,created_at timestamptz not null default now());
create table purchase_order_items(id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references purchase_orders,product_id uuid not null references products,quantity integer not null check(quantity>0),cost_sen bigint not null check(cost_sen>=0),unique(purchase_order_id,product_id));
create table goods_received(id uuid primary key default gen_random_uuid(),purchase_order_id uuid unique not null references purchase_orders,staff_id uuid not null references profiles,created_at timestamptz not null default now());
create table held_orders(id uuid primary key default gen_random_uuid(),cashier_id uuid not null references profiles,branch_id uuid not null references branches,label text not null,cart jsonb not null,created_at timestamptz not null default now());
create table promotions(id uuid primary key default gen_random_uuid(),name text not null,percent_bps integer not null check(percent_bps between 0 and 10000),starts_at timestamptz not null,ends_at timestamptz not null,active boolean not null default true,check(ends_at>starts_at));
create table system_settings(branch_id uuid primary key references branches,tax_bps integer not null default 0 check(tax_bps between 0 and 10000),cashier_discount_bps integer not null default 0 check(cashier_discount_bps between 0 and 10000));
create table audit_logs(id uuid primary key default gen_random_uuid(),staff_id uuid references profiles,action text not null,entity_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
create index sales_branch_date on sales(branch_id,created_at);
create index sale_items_sale on sale_items(sale_id);
create index refunds_sale on refunds(sale_id);
create index refund_items_sale_item on refund_items(sale_item_id);
create index movements_product_date on stock_movements(product_id,created_at);
create or replace function staff_role() returns text language sql stable security definer set search_path=public,pg_temp as $$select role from profiles where id=auth.uid() and active$$;
create or replace function staff_branch() returns uuid language sql stable security definer set search_path=public,pg_temp as $$select branch_id from profiles where id=auth.uid() and active$$;
create or replace function require_role(allowed text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin if auth.uid() is null or not coalesce(staff_role()=any(allowed),false) then raise exception 'Permission denied' using errcode='42501';end if;end$$;
-- All data is deny-by-default; mutations occur through narrowly scoped functions below.
do $$declare t text;begin foreach t in array array['businesses','branches','profiles','product_categories','products','product_costs','inventory','suppliers','customers','cashier_sessions','cash_movements','sales','sale_items','sale_item_costs','payments','refunds','refund_items','stock_movements','purchase_orders','purchase_order_items','goods_received','held_orders','promotions','system_settings','audit_logs'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon, authenticated',t);execute format('grant select on %I to authenticated',t);end loop;end$$;
create policy read_business on businesses for select to authenticated using(id in(select business_id from branches where id=staff_branch()));
create policy read_branch on branches for select to authenticated using(id=staff_branch());
create policy read_profiles on profiles for select to authenticated using(id=auth.uid() or (staff_role()='owner' and branch_id=staff_branch()));
create policy read_categories on product_categories for select to authenticated using(staff_role() is not null);
create policy read_products on products for select to authenticated using(staff_role() is not null);
create policy read_costs on product_costs for select to authenticated using(staff_role()='owner');
create policy read_inventory on inventory for select to authenticated using(branch_id=staff_branch());
create policy read_suppliers on suppliers for select to authenticated using(staff_role() in ('owner','manager'));
create policy read_customers on customers for select to authenticated using(staff_role() in ('owner','manager','cashier'));
create policy read_sessions on cashier_sessions for select to authenticated using(branch_id=staff_branch() and (cashier_id=auth.uid() or staff_role() in ('owner','manager')));
create policy read_cash on cash_movements for select to authenticated using(session_id in(select id from cashier_sessions));
create policy read_sales on sales for select to authenticated using(branch_id=staff_branch() and (cashier_id=auth.uid() or staff_role() in ('owner','manager')));
create policy read_items on sale_items for select to authenticated using(sale_id in(select id from sales));
create policy read_historical_costs on sale_item_costs for select to authenticated using(staff_role()='owner' and sale_item_id in(select id from sale_items));
create policy read_payments on payments for select to authenticated using(sale_id in(select id from sales));
create policy read_refunds on refunds for select to authenticated using(sale_id in(select id from sales));
create policy read_refund_items on refund_items for select to authenticated using(refund_id in(select id from refunds));
create policy read_stock on stock_movements for select to authenticated using(branch_id=staff_branch() and staff_role() in ('owner','manager'));
create policy read_po on purchase_orders for select to authenticated using(branch_id=staff_branch() and staff_role() in ('owner','manager'));
create policy read_po_items on purchase_order_items for select to authenticated using(purchase_order_id in(select id from purchase_orders));
create policy read_received on goods_received for select to authenticated using(purchase_order_id in(select id from purchase_orders));
create policy read_held on held_orders for select to authenticated using(cashier_id=auth.uid() and branch_id=staff_branch());
create policy read_promotions on promotions for select to authenticated using(staff_role() is not null);
create policy read_settings on system_settings for select to authenticated using(branch_id=staff_branch());
create policy read_audit on audit_logs for select to authenticated using(staff_role()='owner');
create function checkout(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
 if staff_role()='cashier' and (itemdiscounts+orderdiscount)*10000>subtotal*coalesce(settings.cashier_discount_bps,0) then raise exception 'Discount requires manager checkout';end if;
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
create function retail_action(action text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; target uuid; qty integer; oldqty integer; sess cashier_sessions; s sales; si sale_items; refunded integer; allocated bigint; beforeweight bigint; weight bigint; totalweight bigint; refundamount bigint; refundtax bigint; allocatedtax bigint; counted bigint; expected bigint; r record;
begin
 perform require_role(array['owner','manager','cashier']);
 case action
 when 'hold' then insert into held_orders(cashier_id,branch_id,label,cart) values(auth.uid(),staff_branch(),left(payload->>'label',100),payload->'cart') returning id into result;
 when 'delete_hold' then delete from held_orders where id=(payload->>'id')::uuid and cashier_id=auth.uid();
 when 'customer' then
 if payload->>'id' is not null then
 perform require_role(array['owner','manager']);
 update customers set name=payload->>'name',phone=payload->>'phone',email=payload->>'email',notes=payload->>'notes',membership_tier=coalesce(payload->>'membership_tier','Standard'),loyalty_points=coalesce((payload->>'loyalty_points')::integer,0),marketing_consent=coalesce((payload->>'marketing_consent')::boolean,false) where id=(payload->>'id')::uuid returning id into result;
 else insert into customers(name,phone,email,notes,marketing_consent) values(payload->>'name',payload->>'phone',payload->>'email',payload->>'notes',coalesce((payload->>'marketing_consent')::boolean,false)) returning id into result;end if;
 when 'open_session' then insert into cashier_sessions(branch_id,cashier_id,opening_sen) values(staff_branch(),auth.uid(),(payload->>'opening_sen')::bigint) returning id into result;
 when 'close_session' then
 select * into strict sess from cashier_sessions where id=(payload->>'id')::uuid and cashier_id=auth.uid() and status='open' for update;
 counted:=(payload->>'actual_sen')::bigint;
 select sess.opening_sen+coalesce((select sum(p.amount_sen) from payments p join sales sale_row on sale_row.id=p.sale_id where sale_row.session_id=sess.id and p.method='cash'),0)-coalesce((select sum(total_sen) from refunds where session_id=sess.id and method='cash'),0)+coalesce((select sum(amount_sen) from cash_movements where session_id=sess.id),0) into expected;
 update cashier_sessions set actual_sen=counted,expected_sen=expected,difference_sen=counted-expected,status='submitted',ended_at=now() where id=sess.id;result:=sess.id;
 else
 perform require_role(array['owner','manager']);
 case action
 when 'adjust_stock' then
 target:=(payload->>'product_id')::uuid;qty:=(payload->>'quantity')::integer;
 if (payload->>'type' in ('stock-out','damaged','expired') and qty>=0) or (payload->>'type'='stock-in' and qty<=0) then raise exception 'Stock-in must be positive; stock-out, damaged and expired must be negative';end if;
 if qty=0 or length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Quantity and reason required';end if;
 insert into inventory(branch_id,product_id,quantity) values(staff_branch(),target,0) on conflict do nothing;
 select quantity into oldqty from inventory where branch_id=staff_branch() and product_id=target for update;
 update inventory set quantity=quantity+qty where branch_id=staff_branch() and product_id=target;
 insert into stock_movements(branch_id,product_id,quantity,movement_type,staff_id,reason,batch,expires_on) values(staff_branch(),target,qty,coalesce(payload->>'type','adjustment'),auth.uid(),payload->>'reason',payload->>'batch',(payload->>'expires_on')::date) returning id into result;
 when 'supplier' then insert into suppliers(id,name,phone,email,notes) values(coalesce((payload->>'id')::uuid,gen_random_uuid()),payload->>'name',payload->>'phone',payload->>'email',payload->>'notes') on conflict(id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,notes=excluded.notes returning id into result;
 when 'purchase_order' then
 insert into purchase_orders(supplier_id,branch_id,staff_id) values((payload->>'supplier_id')::uuid,staff_branch(),auth.uid()) returning id into result;
 insert into purchase_order_items(purchase_order_id,product_id,quantity,cost_sen) values(result,(payload->>'product_id')::uuid,(payload->>'quantity')::integer,(payload->>'cost_sen')::bigint);
 when 'receive_order' then
 select id into strict result from purchase_orders where id=(payload->>'id')::uuid and branch_id=staff_branch() and status='ordered' for update;
 for r in select * from purchase_order_items where purchase_order_id=result order by product_id loop
 insert into inventory(branch_id,product_id,quantity) values(staff_branch(),r.product_id,0) on conflict do nothing;
 update inventory set quantity=quantity+r.quantity where branch_id=staff_branch() and product_id=r.product_id;
 insert into stock_movements(branch_id,product_id,quantity,movement_type,staff_id,reference_id,reason) values(staff_branch(),r.product_id,r.quantity,'received',auth.uid(),result,'Purchase order received');end loop;
 insert into goods_received(purchase_order_id,staff_id) values(result,auth.uid());update purchase_orders set status='received' where id=result;
 when 'approve_session' then
 update cashier_sessions set status='approved',approved_by=auth.uid(),approved_at=now() where id=(payload->>'id')::uuid and branch_id=staff_branch() and status='submitted' and cashier_id<>auth.uid() returning id into result;
 if result is null then raise exception 'A different manager must approve a submitted session';end if;
 when 'cash_movement' then
 select * into strict sess from cashier_sessions where id=(payload->>'session_id')::uuid and branch_id=staff_branch() and status='open' for update;
 insert into cash_movements(session_id,amount_sen,reason,staff_id) values(sess.id,(payload->>'amount_sen')::bigint,payload->>'reason',auth.uid()) returning id into result;
 when 'refund' then
 perform pg_advisory_xact_lock(hashtextextended(payload->>'key',0));
 select id into result from refunds where idempotency_key=(payload->>'key')::uuid;if result is not null then return result;end if;
 select * into strict s from sales where id=(payload->>'sale_id')::uuid and branch_id=staff_branch() for update;
 if length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Refund reason required';end if;
 select * into strict si from sale_items where id=(payload->>'sale_item_id')::uuid and sale_id=s.id;
 qty:=(payload->>'quantity')::integer;select coalesce(sum(quantity),0) into refunded from refund_items where sale_item_id=si.id;
 if qty<1 or qty+refunded>si.quantity then raise exception 'Refund quantity exceeds remaining sold quantity';end if;
 -- Allocate all order discounts and tax proportionally; cumulative rounding guarantees exact full-sale refunds.
 select sum(total_sen) into totalweight from sale_items where sale_id=s.id;
 select coalesce(sum(total_sen),0) into beforeweight from sale_items where sale_id=s.id and id<si.id;
 weight:=si.total_sen;
 if totalweight=0 then allocated:=0;else allocated:=floor((beforeweight+weight)::numeric*s.total_sen/totalweight)-floor(beforeweight::numeric*s.total_sen/totalweight);end if;
 refundamount:=allocated*(refunded+qty)/si.quantity-allocated*refunded/si.quantity;
 if totalweight=0 then allocatedtax:=0;else allocatedtax:=floor((beforeweight+weight)::numeric*s.tax_sen/totalweight)-floor(beforeweight::numeric*s.tax_sen/totalweight);end if;
 refundtax:=allocatedtax*(refunded+qty)/si.quantity-allocatedtax*refunded/si.quantity;
 target:=null;
 if payload->>'method'='cash' then select id into strict target from cashier_sessions where cashier_id=auth.uid() and status='open' and branch_id=staff_branch() for update;end if;
 insert into refunds(sale_id,staff_id,reason,total_sen,tax_sen,method,session_id,idempotency_key) values(s.id,auth.uid(),payload->>'reason',refundamount,refundtax,payload->>'method',target,(payload->>'key')::uuid) returning id into result;
 insert into refund_items(refund_id,sale_item_id,quantity,amount_sen,restock) values(result,si.id,qty,refundamount,coalesce((payload->>'restock')::boolean,false));
 if coalesce((payload->>'restock')::boolean,false) then
 update inventory set quantity=quantity+qty where branch_id=staff_branch() and product_id=si.product_id;
 insert into stock_movements(branch_id,product_id,quantity,movement_type,staff_id,reference_id,reason) values(staff_branch(),si.product_id,qty,'refund',auth.uid(),result,payload->>'reason');end if;
 else
 perform require_role(array['owner']);
 case action
 when 'product' then
 target:=coalesce((payload->>'id')::uuid,gen_random_uuid());
 insert into products(id,sku,name,english_name,description,barcode,category_id,price_sen,image_url,archived,low_stock) values(target,payload->>'sku',payload->>'name',payload->>'english_name',payload->>'description',nullif(payload->>'barcode',''),(payload->>'category_id')::uuid,(payload->>'price_sen')::bigint,payload->>'image_url',coalesce((payload->>'archived')::boolean,false),coalesce((payload->>'low_stock')::integer,5)) on conflict(id) do update set sku=excluded.sku,name=excluded.name,english_name=excluded.english_name,description=excluded.description,barcode=excluded.barcode,category_id=excluded.category_id,price_sen=excluded.price_sen,image_url=excluded.image_url,archived=excluded.archived,low_stock=excluded.low_stock,updated_at=now();
 insert into product_costs(product_id,cost_sen) values(target,(payload->>'cost_sen')::bigint) on conflict(product_id) do update set cost_sen=excluded.cost_sen;
 insert into inventory(branch_id,product_id,quantity) values(staff_branch(),target,0) on conflict do nothing;result:=target;
 when 'staff' then
 if (payload->>'id')::uuid=auth.uid() then raise exception 'Cannot change your own privileges';end if;
 insert into profiles(id,display_name,branch_id,role,active) values((payload->>'id')::uuid,payload->>'display_name',staff_branch(),payload->>'role',coalesce((payload->>'active')::boolean,true)) on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active where profiles.branch_id=staff_branch();result:=(payload->>'id')::uuid;
 when 'settings' then update system_settings set tax_bps=(payload->>'tax_bps')::integer,cashier_discount_bps=(payload->>'cashier_discount_bps')::integer where branch_id=staff_branch();
 when 'category' then insert into product_categories(name) values(payload->>'name') returning id into result;
 when 'promotion_toggle' then update promotions set active=(payload->>'active')::boolean where id=(payload->>'id')::uuid returning id into result;
 when 'promotion' then insert into promotions(name,percent_bps,starts_at,ends_at) values(payload->>'name',(payload->>'percent_bps')::integer,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz) returning id into result;
 else raise exception 'Unknown action';end case;end case;end case;
 insert into audit_logs(staff_id,action,entity_id,details) values(auth.uid(),action,result,payload-'cart');return result;
end$$;
-- Secure function exposure: helper functions never grant a write capability.
revoke all on function checkout(jsonb),retail_action(text,jsonb),require_role(text[]) from public,anon;
grant execute on function checkout(jsonb),retail_action(text,jsonb) to authenticated;
revoke all on sequence receipt_sequence from public,anon,authenticated;
insert into businesses(id,name,ssm) values('10000000-0000-0000-0000-000000000001','CHIPSTI ENTERPRISE','202603232290 (RA0139100-V)');
insert into branches(id,business_id,name) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Main store');
insert into system_settings(branch_id) values('20000000-0000-0000-0000-000000000001');
insert into product_categories(name) values('Snacks'),('Tiramisu'),('Pillows'),('Towels'),('Gift Sets'),('Other Retail Merchandise');
with seed(sku,name,cost,price) as(values
('LF-02','原味黄金呀菇',900,1800),('LF-05','咸蛋呀菇',1200,2400),('LF-08','金香咸蛋鱼皮',1100,2200),('LF-11','咸蛋黑松露鱼皮',1100,2200),('LF-21','咸蛋蟹柳片',1400,2800),('LB-91','黄金凤梨球',1700,3300),('L-121','墨西哥风味巧克力蛋饼',1900,3700),('L-146','金桶古早味海苔鸡丝荷包饼',2400,4700),('LCP-25','比利时海盐黑巧克力',2300,4500),('L-28','黑芝麻方罐蜜蜂窝',1200,2400),('L-36','金香鸡丝蛋卷',2300,4500)), added as(insert into products(sku,name,price_sen,category_id) select sku,name,price,(select id from product_categories where name='Snacks') from seed returning id,sku) insert into product_costs select added.id,seed.cost from added join seed using(sku);
insert into inventory select '20000000-0000-0000-0000-000000000001',id,0 from products;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy product_image_read on storage.objects for select to authenticated using(bucket_id='product-images');
create policy product_image_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.staff_role()='owner');
commit;
