begin;
create table sale_voids(id uuid primary key default gen_random_uuid(),sale_id uuid unique not null references sales,staff_id uuid not null references profiles,reason text not null,created_at timestamptz not null default now());
alter table sale_voids enable row level security;
revoke all on sale_voids from anon,authenticated;
grant select on sale_voids to authenticated;
create policy read_voids on sale_voids for select to authenticated using(sale_id in(select id from sales));
create function void_sale(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s sales; r record; vid uuid; returned integer;
begin
 perform require_role(array['owner','manager']);
 select * into strict s from sales where id=(payload->>'sale_id')::uuid and branch_id=staff_branch() for update;
 select id into vid from sale_voids where sale_id=s.id;if vid is not null then return vid;end if;
 if length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Void reason required';end if;
 for r in select * from sale_items where sale_id=s.id order by id loop
 select coalesce(sum(quantity),0) into returned from refund_items where sale_item_id=r.id;
 if returned<r.quantity then perform retail_action('refund',jsonb_build_object('key',gen_random_uuid(),'sale_id',s.id,'sale_item_id',r.id,'quantity',r.quantity-returned,'method',payload->>'method','reason','VOID: '||(payload->>'reason'),'restock',coalesce((payload->>'restock')::boolean,false)));end if;
 end loop;
 insert into sale_voids(sale_id,staff_id,reason) values(s.id,auth.uid(),payload->>'reason') returning id into vid;
 insert into audit_logs(staff_id,action,entity_id,details) values(auth.uid(),'void',s.id,jsonb_build_object('reason',payload->>'reason'));return vid;
end$$;
revoke all on function void_sale(jsonb) from public,anon;
grant execute on function void_sale(jsonb) to authenticated;
commit;
