-- CHIPSTI PROMOTION RELEASE REVIEW v2 — NOT APPROVED FOR EXECUTION
-- Target: CHIPSTI POS xmbusapgcxtmdjvnbdgs with the reviewed promotion schema installed.
-- Separate campaign publication approval required.
-- SEPARATE APPROVAL REQUIRED. Not part of the schema migration.
begin;
set local lock_timeout='5s';
do $activate_cgsvip20$
declare p public.promotions;
begin
 if not exists(select 1 from public.businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') or not exists(select 1 from public.branches where id='20000000-0000-0000-0000-000000000001' and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'STOP: Activation target is not CHIPSTI POS';end if;
 select * into strict p from public.promotions where code='CGSVIP20' for update;
 if p.branch_id<>'20000000-0000-0000-0000-000000000001'::uuid or p.name<>'Cili Gemuk Selayang Customer Special' or p.discount_type<>'percent' or p.percent_bps<>2000 or p.fixed_discount_sen<>0 or p.starts_at<>'2026-11-06 00:00:00+08'::timestamptz or p.ends_at<>'2026-11-30 23:59:59.999999+08'::timestamptz or p.minimum_spend_sen<>0 or p.discount_cap_sen is not null or p.max_redemptions is not null or cardinality(p.eligible_product_ids||p.eligible_category_ids||p.excluded_product_ids||p.excluded_category_ids)<>0 or p.allow_manual_stacking or p.active then raise exception 'STOP: CGSVIP20 configuration does not match the reviewed offer';end if;
 if p.ends_at<clock_timestamp() or p.publication_status not in ('draft','published') then raise exception 'STOP: Do not reactivate an ended, paused or expired campaign';end if;
 if p.publication_status='draft' then update public.promotions set publication_status='published' where id=p.id;end if;
end
$activate_cgsvip20$;
commit;
-- END SEPARATE CGSVIP20 ACTIVATION — DO NOT RUN WITHOUT APPROVAL
