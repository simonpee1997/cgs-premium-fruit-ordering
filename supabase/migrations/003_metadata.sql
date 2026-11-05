begin;
create table staff_roles(name text primary key check(name in ('owner','manager','cashier')),description text not null);
insert into staff_roles values('owner','Full business access including confidential costs and staff provisioning'),('manager','Retail operations, purchasing, refunds and closing approval'),('cashier','Own sales, receipts, customers and sessions');
alter table profiles add constraint profile_role_reference foreign key(role) references staff_roles(name);
alter table staff_roles enable row level security;
revoke all on staff_roles from anon,authenticated;
grant select on staff_roles to authenticated;
create policy staff_role_read on staff_roles for select to authenticated using(staff_role() is not null);
create function touch_updated_at() returns trigger language plpgsql set search_path=public,pg_temp as $$begin new.updated_at=now();return new;end$$;
do $$declare target text;begin foreach target in array array['businesses','branches','profiles','product_categories','product_costs','inventory','suppliers','customers','cashier_sessions','purchase_orders','held_orders','promotions','system_settings'] loop
execute format('alter table %I add column updated_at timestamptz not null default now()',target);
execute format('create trigger set_updated_at before update on %I for each row execute function touch_updated_at()',target);
end loop;end$$;
create trigger product_updated_at before update on products for each row execute function touch_updated_at();
-- Historical sale category remains stable when a product is recategorized.
alter table sale_items add column category_name text;
create function snapshot_category() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin select c.name into new.category_name from products p left join product_categories c on c.id=p.category_id where p.id=new.product_id;return new;end$$;
create trigger capture_category before insert on sale_items for each row execute function snapshot_category();
revoke all on function snapshot_category(),touch_updated_at() from public,anon,authenticated;
commit;
