-- CHIPSTI PROMOTION RELEASE REVIEW v2 — NOT APPROVED FOR EXECUTION
-- Target: CHIPSTI POS xmbusapgcxtmdjvnbdgs through migrations 001–007 only.
-- Fresh install only. No automatic campaign publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(hashtextextended('chipsti-promotion-reviewed-v2',0));
do $schema_preflight$
declare expected jsonb := $expected_schema${"note":"Generated only from an isolated PostgreSQL database applying repository migrations 001–007. Not a production export.","columns":[{"table_name":"audit_logs","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"audit_logs","column_name":"staff_id","data_type":"uuid","not_null":false},{"table_name":"audit_logs","column_name":"action","data_type":"text","not_null":true},{"table_name":"audit_logs","column_name":"entity_id","data_type":"uuid","not_null":false},{"table_name":"audit_logs","column_name":"details","data_type":"jsonb","not_null":true},{"table_name":"audit_logs","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"branches","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"branches","column_name":"business_id","data_type":"uuid","not_null":true},{"table_name":"branches","column_name":"name","data_type":"text","not_null":true},{"table_name":"branches","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"businesses","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"businesses","column_name":"name","data_type":"text","not_null":true},{"table_name":"businesses","column_name":"ssm","data_type":"text","not_null":true},{"table_name":"businesses","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"cash_movements","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"cash_movements","column_name":"session_id","data_type":"uuid","not_null":true},{"table_name":"cash_movements","column_name":"amount_sen","data_type":"bigint","not_null":true},{"table_name":"cash_movements","column_name":"reason","data_type":"text","not_null":true},{"table_name":"cash_movements","column_name":"staff_id","data_type":"uuid","not_null":true},{"table_name":"cash_movements","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"cashier_sessions","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"cashier_sessions","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"cashier_sessions","column_name":"cashier_id","data_type":"uuid","not_null":true},{"table_name":"cashier_sessions","column_name":"opening_sen","data_type":"bigint","not_null":true},{"table_name":"cashier_sessions","column_name":"actual_sen","data_type":"bigint","not_null":false},{"table_name":"cashier_sessions","column_name":"expected_sen","data_type":"bigint","not_null":false},{"table_name":"cashier_sessions","column_name":"difference_sen","data_type":"bigint","not_null":false},{"table_name":"cashier_sessions","column_name":"status","data_type":"text","not_null":true},{"table_name":"cashier_sessions","column_name":"started_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"cashier_sessions","column_name":"ended_at","data_type":"timestamp with time zone","not_null":false},{"table_name":"cashier_sessions","column_name":"approved_by","data_type":"uuid","not_null":false},{"table_name":"cashier_sessions","column_name":"approved_at","data_type":"timestamp with time zone","not_null":false},{"table_name":"cashier_sessions","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"customers","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"customers","column_name":"name","data_type":"text","not_null":true},{"table_name":"customers","column_name":"phone","data_type":"text","not_null":false},{"table_name":"customers","column_name":"email","data_type":"text","not_null":false},{"table_name":"customers","column_name":"notes","data_type":"text","not_null":false},{"table_name":"customers","column_name":"loyalty_points","data_type":"integer","not_null":true},{"table_name":"customers","column_name":"membership_tier","data_type":"text","not_null":true},{"table_name":"customers","column_name":"marketing_consent","data_type":"boolean","not_null":true},{"table_name":"customers","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"customers","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"goods_received","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"goods_received","column_name":"purchase_order_id","data_type":"uuid","not_null":true},{"table_name":"goods_received","column_name":"staff_id","data_type":"uuid","not_null":true},{"table_name":"goods_received","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"held_orders","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"held_orders","column_name":"cashier_id","data_type":"uuid","not_null":true},{"table_name":"held_orders","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"held_orders","column_name":"label","data_type":"text","not_null":true},{"table_name":"held_orders","column_name":"cart","data_type":"jsonb","not_null":true},{"table_name":"held_orders","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"held_orders","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"inventory","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"inventory","column_name":"product_id","data_type":"uuid","not_null":true},{"table_name":"inventory","column_name":"quantity","data_type":"integer","not_null":true},{"table_name":"inventory","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"online_order_events","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"online_order_events","column_name":"order_id","data_type":"uuid","not_null":true},{"table_name":"online_order_events","column_name":"event","data_type":"text","not_null":true},{"table_name":"online_order_events","column_name":"staff_id","data_type":"uuid","not_null":false},{"table_name":"online_order_events","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"online_order_items","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"online_order_items","column_name":"order_id","data_type":"uuid","not_null":true},{"table_name":"online_order_items","column_name":"product_id","data_type":"uuid","not_null":true},{"table_name":"online_order_items","column_name":"sku","data_type":"text","not_null":true},{"table_name":"online_order_items","column_name":"name","data_type":"text","not_null":true},{"table_name":"online_order_items","column_name":"category_name","data_type":"text","not_null":false},{"table_name":"online_order_items","column_name":"quantity","data_type":"integer","not_null":true},{"table_name":"online_order_items","column_name":"unit_price_sen","data_type":"bigint","not_null":true},{"table_name":"online_order_items","column_name":"total_sen","data_type":"bigint","not_null":true},{"table_name":"online_orders","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"online_orders","column_name":"idempotency_key","data_type":"uuid","not_null":true},{"table_name":"online_orders","column_name":"request_hash","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"tracking_token","data_type":"uuid","not_null":true},{"table_name":"online_orders","column_name":"order_number","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"online_orders","column_name":"status","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"customer_name","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"phone","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"email","data_type":"text","not_null":false},{"table_name":"online_orders","column_name":"fulfillment","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"address","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"postcode","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"notes","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"payment_method","data_type":"text","not_null":true},{"table_name":"online_orders","column_name":"payment_reference","data_type":"text","not_null":false},{"table_name":"online_orders","column_name":"instructions","data_type":"jsonb","not_null":true},{"table_name":"online_orders","column_name":"subtotal_sen","data_type":"bigint","not_null":true},{"table_name":"online_orders","column_name":"delivery_fee_sen","data_type":"bigint","not_null":true},{"table_name":"online_orders","column_name":"tax_bps","data_type":"integer","not_null":true},{"table_name":"online_orders","column_name":"tax_sen","data_type":"bigint","not_null":true},{"table_name":"online_orders","column_name":"total_sen","data_type":"bigint","not_null":true},{"table_name":"online_orders","column_name":"sale_id","data_type":"uuid","not_null":false},{"table_name":"online_orders","column_name":"expires_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"online_orders","column_name":"confirmed_by","data_type":"uuid","not_null":false},{"table_name":"online_orders","column_name":"confirmed_at","data_type":"timestamp with time zone","not_null":false},{"table_name":"online_orders","column_name":"cancellation_reason","data_type":"text","not_null":false},{"table_name":"online_orders","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"online_orders","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"online_orders","column_name":"standard_delivery_fee_sen","data_type":"bigint","not_null":false},{"table_name":"online_orders","column_name":"delivery_discount_sen","data_type":"bigint","not_null":true},{"table_name":"online_orders","column_name":"delivery_area_name","data_type":"text","not_null":false},{"table_name":"online_orders","column_name":"payment_proof_received","data_type":"boolean","not_null":true},{"table_name":"online_store_settings","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"online_store_settings","column_name":"enabled","data_type":"boolean","not_null":true},{"table_name":"online_store_settings","column_name":"allow_pickup","data_type":"boolean","not_null":true},{"table_name":"online_store_settings","column_name":"allow_delivery","data_type":"boolean","not_null":true},{"table_name":"online_store_settings","column_name":"allow_cash_pickup","data_type":"boolean","not_null":true},{"table_name":"online_store_settings","column_name":"pickup_address","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"contact_phone","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"delivery_fee_sen","data_type":"bigint","not_null":true},{"table_name":"online_store_settings","column_name":"delivery_postcode_prefixes","data_type":"text[]","not_null":true},{"table_name":"online_store_settings","column_name":"delivery_note","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"bank_name","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"bank_account_name","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"bank_account_number","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"duitnow_qr_url","data_type":"text","not_null":true},{"table_name":"online_store_settings","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"online_store_settings","column_name":"delivery_areas","data_type":"jsonb","not_null":true},{"table_name":"payment_proofs","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"payment_proofs","column_name":"claim_token","data_type":"uuid","not_null":true},{"table_name":"payment_proofs","column_name":"upload_key","data_type":"uuid","not_null":true},{"table_name":"payment_proofs","column_name":"request_bucket","data_type":"text","not_null":true},{"table_name":"payment_proofs","column_name":"original_filename","data_type":"text","not_null":true},{"table_name":"payment_proofs","column_name":"mime_type","data_type":"text","not_null":true},{"table_name":"payment_proofs","column_name":"byte_size","data_type":"bigint","not_null":true},{"table_name":"payment_proofs","column_name":"sha256","data_type":"text","not_null":true},{"table_name":"payment_proofs","column_name":"total_sen","data_type":"bigint","not_null":true},{"table_name":"payment_proofs","column_name":"object_path","data_type":"text","not_null":true},{"table_name":"payment_proofs","column_name":"status","data_type":"text","not_null":true},{"table_name":"payment_proofs","column_name":"order_id","data_type":"uuid","not_null":false},{"table_name":"payment_proofs","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"payment_proofs","column_name":"verified_at","data_type":"timestamp with time zone","not_null":false},{"table_name":"payment_proofs","column_name":"expires_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"payments","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"payments","column_name":"sale_id","data_type":"uuid","not_null":true},{"table_name":"payments","column_name":"method","data_type":"text","not_null":true},{"table_name":"payments","column_name":"amount_sen","data_type":"bigint","not_null":true},{"table_name":"payments","column_name":"tendered_sen","data_type":"bigint","not_null":true},{"table_name":"payments","column_name":"reference","data_type":"text","not_null":false},{"table_name":"payments","column_name":"verification","data_type":"text","not_null":true},{"table_name":"product_categories","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"product_categories","column_name":"name","data_type":"text","not_null":true},{"table_name":"product_categories","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"product_costs","column_name":"product_id","data_type":"uuid","not_null":true},{"table_name":"product_costs","column_name":"cost_sen","data_type":"bigint","not_null":true},{"table_name":"product_costs","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"products","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"products","column_name":"sku","data_type":"text","not_null":true},{"table_name":"products","column_name":"name","data_type":"text","not_null":true},{"table_name":"products","column_name":"english_name","data_type":"text","not_null":false},{"table_name":"products","column_name":"description","data_type":"text","not_null":false},{"table_name":"products","column_name":"barcode","data_type":"text","not_null":false},{"table_name":"products","column_name":"category_id","data_type":"uuid","not_null":false},{"table_name":"products","column_name":"price_sen","data_type":"bigint","not_null":true},{"table_name":"products","column_name":"image_url","data_type":"text","not_null":false},{"table_name":"products","column_name":"archived","data_type":"boolean","not_null":true},{"table_name":"products","column_name":"low_stock","data_type":"integer","not_null":true},{"table_name":"products","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"products","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"profiles","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"profiles","column_name":"display_name","data_type":"text","not_null":true},{"table_name":"profiles","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"profiles","column_name":"role","data_type":"text","not_null":true},{"table_name":"profiles","column_name":"active","data_type":"boolean","not_null":true},{"table_name":"profiles","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"profiles","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"promotions","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"promotions","column_name":"name","data_type":"text","not_null":true},{"table_name":"promotions","column_name":"percent_bps","data_type":"integer","not_null":true},{"table_name":"promotions","column_name":"starts_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"promotions","column_name":"ends_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"promotions","column_name":"active","data_type":"boolean","not_null":true},{"table_name":"promotions","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"purchase_order_items","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"purchase_order_items","column_name":"purchase_order_id","data_type":"uuid","not_null":true},{"table_name":"purchase_order_items","column_name":"product_id","data_type":"uuid","not_null":true},{"table_name":"purchase_order_items","column_name":"quantity","data_type":"integer","not_null":true},{"table_name":"purchase_order_items","column_name":"cost_sen","data_type":"bigint","not_null":true},{"table_name":"purchase_orders","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"purchase_orders","column_name":"supplier_id","data_type":"uuid","not_null":true},{"table_name":"purchase_orders","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"purchase_orders","column_name":"status","data_type":"text","not_null":true},{"table_name":"purchase_orders","column_name":"staff_id","data_type":"uuid","not_null":true},{"table_name":"purchase_orders","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"purchase_orders","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"refund_items","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"refund_items","column_name":"refund_id","data_type":"uuid","not_null":true},{"table_name":"refund_items","column_name":"sale_item_id","data_type":"uuid","not_null":true},{"table_name":"refund_items","column_name":"quantity","data_type":"integer","not_null":true},{"table_name":"refund_items","column_name":"amount_sen","data_type":"bigint","not_null":true},{"table_name":"refund_items","column_name":"restock","data_type":"boolean","not_null":true},{"table_name":"refunds","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"refunds","column_name":"sale_id","data_type":"uuid","not_null":true},{"table_name":"refunds","column_name":"staff_id","data_type":"uuid","not_null":true},{"table_name":"refunds","column_name":"reason","data_type":"text","not_null":true},{"table_name":"refunds","column_name":"total_sen","data_type":"bigint","not_null":true},{"table_name":"refunds","column_name":"tax_sen","data_type":"bigint","not_null":true},{"table_name":"refunds","column_name":"method","data_type":"text","not_null":true},{"table_name":"refunds","column_name":"session_id","data_type":"uuid","not_null":false},{"table_name":"refunds","column_name":"idempotency_key","data_type":"uuid","not_null":true},{"table_name":"refunds","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"sale_item_costs","column_name":"sale_item_id","data_type":"uuid","not_null":true},{"table_name":"sale_item_costs","column_name":"cost_sen","data_type":"bigint","not_null":true},{"table_name":"sale_items","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"sale_items","column_name":"sale_id","data_type":"uuid","not_null":true},{"table_name":"sale_items","column_name":"product_id","data_type":"uuid","not_null":false},{"table_name":"sale_items","column_name":"sku","data_type":"text","not_null":true},{"table_name":"sale_items","column_name":"name","data_type":"text","not_null":true},{"table_name":"sale_items","column_name":"quantity","data_type":"integer","not_null":true},{"table_name":"sale_items","column_name":"unit_price_sen","data_type":"bigint","not_null":true},{"table_name":"sale_items","column_name":"discount_sen","data_type":"bigint","not_null":true},{"table_name":"sale_items","column_name":"total_sen","data_type":"bigint","not_null":true},{"table_name":"sale_items","column_name":"category_name","data_type":"text","not_null":false},{"table_name":"sale_voids","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"sale_voids","column_name":"sale_id","data_type":"uuid","not_null":true},{"table_name":"sale_voids","column_name":"staff_id","data_type":"uuid","not_null":true},{"table_name":"sale_voids","column_name":"reason","data_type":"text","not_null":true},{"table_name":"sale_voids","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"sales","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"sales","column_name":"idempotency_key","data_type":"uuid","not_null":true},{"table_name":"sales","column_name":"receipt_number","data_type":"text","not_null":true},{"table_name":"sales","column_name":"cashier_name","data_type":"text","not_null":true},{"table_name":"sales","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"sales","column_name":"cashier_id","data_type":"uuid","not_null":true},{"table_name":"sales","column_name":"session_id","data_type":"uuid","not_null":true},{"table_name":"sales","column_name":"customer_id","data_type":"uuid","not_null":false},{"table_name":"sales","column_name":"subtotal_sen","data_type":"bigint","not_null":true},{"table_name":"sales","column_name":"discount_sen","data_type":"bigint","not_null":true},{"table_name":"sales","column_name":"tax_sen","data_type":"bigint","not_null":true},{"table_name":"sales","column_name":"total_sen","data_type":"bigint","not_null":true},{"table_name":"sales","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"shop_rate_limits","column_name":"bucket","data_type":"text","not_null":true},{"table_name":"shop_rate_limits","column_name":"window_start","data_type":"timestamp with time zone","not_null":true},{"table_name":"shop_rate_limits","column_name":"hits","data_type":"integer","not_null":true},{"table_name":"staff_roles","column_name":"name","data_type":"text","not_null":true},{"table_name":"staff_roles","column_name":"description","data_type":"text","not_null":true},{"table_name":"stock_movements","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"stock_movements","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"stock_movements","column_name":"product_id","data_type":"uuid","not_null":true},{"table_name":"stock_movements","column_name":"quantity","data_type":"integer","not_null":true},{"table_name":"stock_movements","column_name":"movement_type","data_type":"text","not_null":true},{"table_name":"stock_movements","column_name":"staff_id","data_type":"uuid","not_null":true},{"table_name":"stock_movements","column_name":"reference_id","data_type":"uuid","not_null":false},{"table_name":"stock_movements","column_name":"reason","data_type":"text","not_null":true},{"table_name":"stock_movements","column_name":"batch","data_type":"text","not_null":false},{"table_name":"stock_movements","column_name":"expires_on","data_type":"date","not_null":false},{"table_name":"stock_movements","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"suppliers","column_name":"id","data_type":"uuid","not_null":true},{"table_name":"suppliers","column_name":"name","data_type":"text","not_null":true},{"table_name":"suppliers","column_name":"phone","data_type":"text","not_null":false},{"table_name":"suppliers","column_name":"email","data_type":"text","not_null":false},{"table_name":"suppliers","column_name":"notes","data_type":"text","not_null":false},{"table_name":"suppliers","column_name":"created_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"suppliers","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true},{"table_name":"system_settings","column_name":"branch_id","data_type":"uuid","not_null":true},{"table_name":"system_settings","column_name":"tax_bps","data_type":"integer","not_null":true},{"table_name":"system_settings","column_name":"cashier_discount_bps","data_type":"integer","not_null":true},{"table_name":"system_settings","column_name":"updated_at","data_type":"timestamp with time zone","not_null":true}],"functions":[{"signature":"manage_online_order_before_delivery(text,jsonb)","source_md5":"b9018ea82f1d2a5ab394f1a04505503e","security_definer":true,"return_type":"uuid","settings":["search_path=public, pg_temp"]},{"signature":"online_order_status(uuid)","source_md5":"6ad8f4812f1542f8d1debecaf4295123","security_definer":true,"return_type":"jsonb","settings":["search_path=public, pg_temp"]},{"signature":"place_online_order(jsonb,text)","source_md5":"2b553ca3560595f2eb3464dc81402bf7","security_definer":true,"return_type":"jsonb","settings":["search_path=public, pg_temp"]},{"signature":"quote_online_order(jsonb)","source_md5":"cee53c9b6e58151b304e9acf23697082","security_definer":true,"return_type":"jsonb","settings":["search_path=public, pg_temp"]},{"signature":"require_role(text[])","source_md5":"634e36a24b6b7685dfcf06afd4781bfc","security_definer":true,"return_type":"void","settings":["search_path=public, pg_temp"]},{"signature":"retail_action(text,jsonb)","source_md5":"0c627b1107148a3529e6d55ada41071e","security_definer":true,"return_type":"uuid","settings":["search_path=public, pg_temp"]},{"signature":"staff_branch()","source_md5":"e675ec409d7a3cb89266119a52808537","security_definer":true,"return_type":"uuid","settings":["search_path=public, pg_temp"]},{"signature":"staff_role()","source_md5":"4ae090d7e0c7db9f886a27b0a5edd9eb","security_definer":true,"return_type":"text","settings":["search_path=public, pg_temp"]}],"policies":[{"table_name":"promotions","polname":"read_promotions","polcmd":"r","expression":"(staff_role() IS NOT NULL)"},{"table_name":"audit_logs","polname":"read_audit","polcmd":"r","expression":"(staff_role() = 'owner'::text)"}]}$expected_schema$::jsonb;
 entry jsonb; actual record; target oid; expected_settings text[];
begin
 if to_regclass('public.businesses') is null or not exists(select 1 from public.businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then raise exception 'STOP: This is not CHIPSTI POS';end if;
 if not exists(select 1 from public.branches where id='20000000-0000-0000-0000-000000000001' and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'STOP: CHIPSTI branch/business mismatch';end if;
 if to_regclass('public.promotion_redemptions') is not null or exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotions' and column_name='code') then raise exception 'STOP: 008/009 is already or partly installed. Do not replay this fresh-install bundle; inspect/export the schema first.';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'STOP: Unsafe public schema CREATE privileges';end if;
 for entry in select value from jsonb_array_elements(expected->'columns') loop
  select format_type(a.atttypid,a.atttypmod) as data_type,a.attnotnull as not_null,c.relrowsecurity as rls into actual from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid where c.oid=to_regclass('public.'||(entry->>'table_name')) and a.attname=entry->>'column_name' and a.attnum>0 and not a.attisdropped;
  if not found or actual.data_type is distinct from entry->>'data_type' or actual.not_null is distinct from (entry->>'not_null')::boolean or not actual.rls then raise exception 'STOP: Schema differs from migrations 001-007 at %.%. Review an actual schema export.',entry->>'table_name',entry->>'column_name';end if;
 end loop;
 for entry in select value from jsonb_array_elements(expected->'functions') loop
  target:=to_regprocedure('public.'||(entry->>'signature'));
  select md5(p.prosrc) as source_md5,p.prosecdef,format_type(p.prorettype,null) as return_type,p.proconfig,p.proowner into actual from pg_catalog.pg_proc p where p.oid=target;
  expected_settings:=array(select jsonb_array_elements_text(entry->'settings'));
  if not found or actual.source_md5 is distinct from entry->>'source_md5' or actual.prosecdef is distinct from (entry->>'security_definer')::boolean or actual.return_type is distinct from entry->>'return_type' or actual.proconfig is distinct from expected_settings then raise exception 'STOP: Existing function % differs from the reviewed 001-007 baseline. Preserve/export it before reviewing a target-specific migration.',entry->>'signature';end if;
  if actual.proowner in(select oid from pg_catalog.pg_roles where rolname in('anon','authenticated','service_role')) then raise exception 'STOP: Unsafe owner for existing SECURITY DEFINER function';end if;
 end loop;
 for entry in select value from jsonb_array_elements(expected->'policies') loop
  select p.polcmd,pg_get_expr(p.polqual,p.polrelid) as expression,p.polroles into actual from pg_catalog.pg_policy p where p.polrelid=to_regclass('public.'||(entry->>'table_name')) and p.polname=entry->>'polname';
  if not found or actual.polcmd::text is distinct from entry->>'polcmd' or regexp_replace(actual.expression,'[\s()]','','g') is distinct from regexp_replace(entry->>'expression','[\s()]','','g') or actual.polroles is distinct from array[(select oid from pg_catalog.pg_roles where rolname='authenticated')] then raise exception 'STOP: Policy % differs from the reviewed baseline',entry->>'polname';end if;
  if (select count(*) from pg_catalog.pg_policy where polrelid=to_regclass('public.'||(entry->>'table_name')))<>1 then raise exception 'STOP: Additional policies on % require review',entry->>'table_name';end if;
 end loop;
end
$schema_preflight$;

-- BEGIN 008_promotion_management.sql
do $chipsti_guard_008$begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotions' and column_name='code') or to_regclass('public.promotion_redemptions') is not null then raise exception 'STOP: Promotion release is already or partially installed. Inspect the schema; do not replay this fresh-install migration.';end if;
 if to_regclass('public.payment_proofs') is null then raise exception 'STOP: Apply migrations through 007 first in CHIPSTI POS.';end if;
 if not exists(select 1 from businesses where id='10000000-0000-0000-0000-000000000001' and name='CHIPSTI ENTERPRISE' and ssm='202603232290 (RA0139100-V)') then raise exception 'STOP: This is not CHIPSTI POS.';end if;
 if not exists(select 1 from branches where id='20000000-0000-0000-0000-000000000001' and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'STOP: CHIPSTI storefront branch does not match its business';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'STOP: Untrusted roles can create objects in public schema';end if;
end$chipsti_guard_008$;

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
 add column created_at timestamptz not null default clock_timestamp(),
 add constraint coded_promotion_safety check(code is null or (branch_id is not null and not active and code~'^[A-Z0-9][A-Z0-9_-]{2,31}$'));
create unique index promotions_unique_code on promotions(upper(code)) where code is not null;

create table promotion_revisions (
 promotion_id uuid not null references promotions on delete cascade,version integer not null,
 branch_id uuid not null references branches,snapshot jsonb not null,changed_by uuid references profiles,
 created_at timestamptz not null default clock_timestamp(),primary key(promotion_id,version)
);
create table promotion_redemptions (
 id uuid primary key default gen_random_uuid(),promotion_id uuid not null references promotions,
 branch_id uuid not null references branches,order_id uuid unique not null references online_orders,
 sale_id uuid unique references sales,code text not null,promotion_name text not null,promotion_version integer not null,
 discount_sen bigint not null check(discount_sen>=0),product_subtotal_sen bigint not null check(product_subtotal_sen>=discount_sen),
 eligible_subtotal_sen bigint not null check(eligible_subtotal_sen between discount_sen and product_subtotal_sen),snapshot jsonb not null,
 state text not null default 'reserved' check(state in ('reserved','redeemed','released')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null
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

-- Existing legacy audit visibility is preserved; new promotion audit events
-- must not leak codes to owners of another branch/business.
drop policy read_audit on audit_logs;
create policy read_audit on audit_logs for select to authenticated using(staff_role()='owner' and (action not like 'promotion:%' or (details->>'branch_id'=staff_branch()::text and exists(select 1 from branches b where b.id=staff_branch() and b.business_id='10000000-0000-0000-0000-000000000001'))));

-- These helpers are private. RPC wrappers run them with the migration owner's
-- privileges; a caller cannot invoke them with arbitrary prices or branch data.
create function require_promotion_owner() returns void language plpgsql security definer set search_path=public,pg_temp as $require_promotion_owner$begin
 perform require_role(array['owner']);
 if not exists(select 1 from branches where id=staff_branch() and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'Promotion access is restricted to CHIPSTI branches' using errcode='42501';end if;
end$require_promotion_owner$;
revoke all on function require_promotion_owner() from public,anon,authenticated,service_role;

create function validate_promotion_items(items jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $validate_promotion_items$declare line jsonb;begin
 if items is null or jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid promotion basket';end if;
 if jsonb_array_length(items) not between 1 and 50 then raise exception 'Invalid promotion basket';end if;
 for line in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(line) is distinct from 'object' then raise exception 'Invalid basket item';end if;
  if exists(select 1 from jsonb_object_keys(line) k where k not in ('product_id','quantity')) then raise exception 'Client-supplied prices or discounts are not accepted';end if;
  if jsonb_typeof(line->'product_id') is distinct from 'string' or coalesce(line->>'product_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid product identifier';end if;
  if jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','')!~'^[0-9]{1,3}$' then raise exception 'Invalid quantity';end if;
  if (line->>'quantity')::integer not between 1 and 100 then raise exception 'Invalid quantity';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(items))<>(select count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(items)) then raise exception 'Duplicate products';end if;
end$validate_promotion_items$;
revoke all on function validate_promotion_items(jsonb) from public,anon,authenticated,service_role;

create function validate_promotion_config() returns trigger language plpgsql set search_path=public,pg_temp as $validate_promotion_config$begin
 if TG_OP='UPDATE' and old.code is not null and new.code is null then raise exception 'A promo code cannot become a legacy POS offer';end if;
 if new.code is null then return new;end if;
 new.code:=upper(trim(new.code));new.name:=trim(new.name);new.active:=false;
 if not exists(select 1 from branches where id=new.branch_id and business_id='10000000-0000-0000-0000-000000000001') then raise exception 'Promotion branch does not belong to CHIPSTI';end if;
 if not isfinite(new.starts_at) or not isfinite(new.ends_at) then raise exception 'Promotion dates must be finite';end if;
 -- UI dates have second precision; include the complete selected final second.
 new.ends_at:=date_trunc('second',new.ends_at)+interval '0.999999 seconds';
 if TG_OP='UPDATE' and old.code is not null and (new.id<>old.id or new.branch_id<>old.branch_id) then raise exception 'Promotion identity and branch cannot change';end if;
 if array_position(new.eligible_product_ids||new.excluded_product_ids||new.eligible_category_ids||new.excluded_category_ids,null) is not null then raise exception 'Null eligibility identifiers are not allowed';end if;
 if length(new.name) not between 1 and 150 then raise exception 'Enter a promotion name';end if;
 if (new.discount_type='percent' and new.percent_bps not between 1 and 10000) or (new.discount_type='fixed' and new.fixed_discount_sen<1) then raise exception 'Discount must be greater than zero and at most 100 percent';end if;
 if greatest(cardinality(new.eligible_product_ids),cardinality(new.excluded_product_ids),cardinality(new.eligible_category_ids),cardinality(new.excluded_category_ids))>100 then raise exception 'Maximum 100 selections per eligibility list';end if;
 if exists(select 1 from unnest(new.eligible_product_ids||new.excluded_product_ids) x where not exists(select 1 from products where id=x)) or exists(select 1 from unnest(new.eligible_category_ids||new.excluded_category_ids) x where not exists(select 1 from product_categories where id=x)) then raise exception 'Unknown eligible product or category';end if;
 if TG_OP='UPDATE' then new.version:=old.version+1;end if;new.updated_at:=now();return new;
end$validate_promotion_config$;
create trigger promotion_config before insert or update on promotions for each row execute function validate_promotion_config();
create function snapshot_promotion_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $snapshot_promotion_revision$begin
 if new.code is not null then insert into promotion_revisions(promotion_id,version,branch_id,snapshot,changed_by) values(new.id,new.version,new.branch_id,to_jsonb(new),auth.uid());end if;return new;
end$snapshot_promotion_revision$;
create trigger promotion_revision after insert or update on promotions for each row execute function snapshot_promotion_revision();
revoke all on function validate_promotion_config(),snapshot_promotion_revision() from public,anon,authenticated,service_role;

create function promotion_effective_status(p promotions,at_time timestamptz) returns text language sql stable security definer set search_path=public,pg_temp as $promotion_effective_status$
 select case
 when p.publication_status='draft' then 'Draft'
 when p.publication_status='paused' then 'Paused'
 when p.publication_status='ended' or at_time is null or at_time>p.ends_at then 'Expired'
 when p.publication_status is distinct from 'published' then 'Draft'
 when at_time<p.starts_at then 'Scheduled'
 when p.max_redemptions is not null and (select count(*) from promotion_redemptions r where r.promotion_id=p.id and (r.state='redeemed' or (r.state='reserved' and r.expires_at>at_time)))>=p.max_redemptions then 'Redemption Limit Reached'
 when p.publication_status='published' and at_time between p.starts_at and p.ends_at then 'Active'
 else 'Expired' end
$promotion_effective_status$;
revoke all on function promotion_effective_status(promotions,timestamptz) from public,anon,authenticated,service_role;

-- Convert only IDs/quantities into a trusted priced cart. Public callers never
-- provide unit prices, eligibility category IDs, time or discount amounts.
create function promotion_priced_cart(items jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $promotion_priced_cart$
declare line jsonb;p products;q integer;result jsonb:='[]';subtotal bigint:=0;
begin
 perform validate_promotion_items(items);
 if (select count(*) from jsonb_array_elements(items))<>(select count(distinct value->>'product_id') from jsonb_array_elements(items)) then raise exception 'Duplicate products';end if;
 for line in select value from jsonb_array_elements(items) loop
  select * into strict p from products where id=(line->>'product_id')::uuid and not archived;
  q:=(line->>'quantity')::integer;if q not between 1 and 100 then raise exception 'Invalid quantity';end if;
  subtotal:=subtotal+p.price_sen*q;if subtotal>100000000 then raise exception 'Basket amount exceeds limit';end if;
  result:=result||jsonb_build_array(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',q,'unit_price_sen',p.price_sen,'discount_sen',0));
 end loop;return result;
end$promotion_priced_cart$;
revoke all on function promotion_priced_cart(jsonb) from public,anon,authenticated,service_role;

create function evaluate_promotion(offer_id uuid,cart jsonb,at_time timestamptz,preview_draft boolean default false,manual_discount_sen bigint default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $evaluate_promotion$
declare p promotions;line jsonb;base bigint;line_discount bigint;subtotal bigint:=0;eligible bigint:=0;line_discounts bigint:=0;amount bigint;status text;
begin
 if at_time is null or not isfinite(at_time) then raise exception 'Invalid promotion time';end if;
 select * into strict p from promotions where id=offer_id and code is not null and branch_id in(select id from branches where business_id='10000000-0000-0000-0000-000000000001');
 if exists(select 1 from jsonb_array_elements(cart) l where not exists(select 1 from inventory i where i.branch_id=p.branch_id and i.product_id=(l->>'product_id')::uuid)) then raise exception 'Product is unavailable in the promotion branch';end if;
 status:=promotion_effective_status(p,at_time);
 if (p.publication_status is distinct from 'published' or at_time not between p.starts_at and p.ends_at or status<>'Active') and not (preview_draft and status='Draft' and at_time between p.starts_at and p.ends_at) then raise exception 'Promotion is %',status;end if;
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
 'snapshot',jsonb_build_object('code',p.code,'name',p.name,'version',p.version,'discount_type',p.discount_type,'percent_bps',p.percent_bps,'fixed_discount_sen',p.fixed_discount_sen,'minimum_spend_sen',p.minimum_spend_sen,'discount_cap_sen',p.discount_cap_sen,'starts_at',p.starts_at,'ends_at',p.ends_at,'allow_manual_stacking',p.allow_manual_stacking,'max_redemptions',p.max_redemptions,'eligible_product_ids',p.eligible_product_ids,'eligible_category_ids',p.eligible_category_ids,'excluded_product_ids',p.excluded_product_ids,'excluded_category_ids',p.excluded_category_ids,'branch_id',p.branch_id));
end$evaluate_promotion$;
revoke all on function evaluate_promotion(uuid,jsonb,timestamptz,boolean,bigint) from public,anon,authenticated,service_role;

create function shop_promotion_quote(promo_code text,items jsonb) returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $shop_promotion_quote$
declare id uuid;begin
 select p.id into id from promotions p where p.code=upper(trim(promo_code)) and p.branch_id='20000000-0000-0000-0000-000000000001';
 if id is null then raise exception 'Invalid promo code';end if;
 return evaluate_promotion(id,promotion_priced_cart(items),clock_timestamp(),false,0)-'snapshot';
end$shop_promotion_quote$;
revoke all on function shop_promotion_quote(text,jsonb) from public,anon,authenticated;
grant execute on function shop_promotion_quote(text,jsonb) to service_role;

create function promotion_generate_code() returns text language plpgsql volatile security definer set search_path=public,pg_temp as $promotion_generate_code$declare candidate text;begin
 perform require_promotion_owner();loop candidate:='CHIP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));exit when not exists(select 1 from promotions p where p.code=candidate);end loop;return candidate;
end$promotion_generate_code$;
revoke all on function promotion_generate_code() from public,anon,service_role;
grant execute on function promotion_generate_code() to authenticated;

create function manage_promotion(operation text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $manage_promotion$
declare p promotions;result uuid;target uuid;state text;begin
 perform require_promotion_owner();
 target:=(payload->>'id')::uuid;
 if target is not null then
  select * into strict p from promotions where id=target and code is not null and branch_id=staff_branch() for update;
  if coalesce((payload->>'expected_version')::integer,-1)<>p.version then raise exception 'This offer changed. Refresh before saving.';end if;
 end if;
 if operation='save' then
  if nullif(trim(payload->>'code'),'') is null then raise exception 'Enter a promo code';end if;
  if (payload->>'publish')::boolean and date_trunc('second',(payload->>'ends_at')::timestamptz)+interval '0.999999 seconds'<clock_timestamp() then raise exception 'Cannot publish an already expired offer';end if;
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
   if (operation='publish' and p.publication_status<>'draft') or (operation='resume' and p.publication_status<>'paused') or p.ends_at<clock_timestamp() then raise exception 'This offer cannot be published or resumed';end if;
   update promotions set publication_status='published' where id=target;
  elsif operation='pause' then
   if p.publication_status<>'published' then raise exception 'Only a published offer can be paused';end if;update promotions set publication_status='paused' where id=target;
  elsif operation='end' then
   if p.publication_status not in ('published','paused') then raise exception 'Only a published or paused offer can be ended';end if;update promotions set publication_status='ended' where id=target;
  else raise exception 'Unknown promotion action';end if;
 end if;
 insert into audit_logs(staff_id,action,entity_id,details) values(auth.uid(),'promotion:'||operation,result,jsonb_build_object('code',coalesce(payload->>'code',p.code),'branch_id',staff_branch(),'business_id','10000000-0000-0000-0000-000000000001'));
 return result;
end$manage_promotion$;
revoke all on function manage_promotion(text,jsonb) from public,anon,service_role;
grant execute on function manage_promotion(text,jsonb) to authenticated;

create function promotion_simulate(payload jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $promotion_simulate$
declare id uuid;result jsonb;at_time timestamptz:=coalesce((payload->>'at')::timestamptz,now());begin
 perform require_promotion_owner();
 select p.id into id from promotions p where p.code=upper(trim(payload->>'code')) and p.branch_id=staff_branch();if id is null then raise exception 'Invalid promo code';end if;
 result:=evaluate_promotion(id,promotion_priced_cart(payload->'items'),at_time,coalesce((payload->>'preview_draft')::boolean,false),coalesce((payload->>'manual_discount_sen')::bigint,0));
 return result||jsonb_build_object('simulation_only',true,'at',at_time);
end$promotion_simulate$;
revoke all on function promotion_simulate(jsonb) from public,anon,service_role;
grant execute on function promotion_simulate(jsonb) to authenticated;

create function promotion_dashboard() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $promotion_dashboard$begin
 perform require_promotion_owner();
 return jsonb_build_object('server_time',now(),'offers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('status',promotion_effective_status(p,now()),
 'redemptions',(select count(*) from promotion_redemptions r where r.promotion_id=p.id and state='redeemed'),
 'reserved',(select count(*) from promotion_redemptions r where r.promotion_id=p.id and state='reserved' and expires_at>now()),
 'total_discount_sen',coalesce((select sum(discount_sen) from promotion_redemptions r where r.promotion_id=p.id and state='redeemed'),0),
 'associated_sales_sen',coalesce((select sum(s.total_sen) from promotion_redemptions r join sales s on s.id=r.sale_id where r.promotion_id=p.id and state='redeemed'),0),
 'net_sales_sen',coalesce((select sum(s.total_sen-coalesce((select sum(total_sen) from refunds f where f.sale_id=s.id),0)) from promotion_redemptions r join sales s on s.id=r.sale_id where r.promotion_id=p.id and state='redeemed'),0)) order by p.created_at desc) from promotions p where p.code is not null and p.branch_id=staff_branch()),'[]'::jsonb),
 'redemptions',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('order_number',o.order_number,'sale_total_sen',coalesce(s.total_sen,0),'refund_sen',coalesce((select sum(total_sen) from refunds f where f.sale_id=s.id),0)) order by r.created_at desc) from promotion_redemptions r join online_orders o on o.id=r.order_id left join sales s on s.id=r.sale_id where r.branch_id=staff_branch()),'[]'::jsonb));
end$promotion_dashboard$;
revoke all on function promotion_dashboard() from public,anon,service_role;
grant execute on function promotion_dashboard() to authenticated;

-- Private integration contract used by migration 009 after it creates a
-- server-priced discounted order. This validates that exact discount, delivery
-- and tax before atomically holding a redemption slot.
create function reserve_promotion_for_order(promo_code text,order_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $reserve_promotion_for_order$
declare p promotions;o online_orders;r promotion_redemptions;cart jsonb;quote jsonb;shipping jsonb;discount bigint;expected_tax bigint;result uuid;begin
 select * into strict p from promotions where code=upper(trim(promo_code)) and branch_id in(select id from branches where business_id='10000000-0000-0000-0000-000000000001') for update;
 select * into strict o from online_orders where id=order_id and branch_id=p.branch_id for update;
 select * into r from promotion_redemptions where promotion_redemptions.order_id=o.id;
 if found then
  if r.promotion_id<>p.id then raise exception 'Only one promo code per order';end if;
  if r.state='released' or (r.state='reserved' and (r.expires_at<=clock_timestamp() or o.expires_at<=clock_timestamp() or o.status not in ('awaiting_payment','payment_submitted'))) then raise exception 'Promotion reservation expired or was released';end if;
  return r.id;end if;
 if o.sale_id is not null or o.status not in ('awaiting_payment','payment_submitted') or o.expires_at<=clock_timestamp() then raise exception 'Order is not eligible for a new redemption';end if;
 select jsonb_agg(jsonb_build_object('product_id',i.product_id,'category_id',pr.category_id,'quantity',i.quantity,'unit_price_sen',i.unit_price_sen,'discount_sen',0)) into cart from online_order_items i join products pr on pr.id=i.product_id where i.order_id=o.id;
 if cart is null then raise exception 'Order has no products';end if;
 quote:=evaluate_promotion(p.id,cart,clock_timestamp(),false,0);discount:=(quote->>'discount_sen')::bigint;
 if (quote->>'product_subtotal_sen')::bigint<>o.subtotal_sen then raise exception 'Order product subtotal mismatch';end if;
 shipping:=shop_delivery_quote(o.branch_id,o.fulfillment,o.postcode,o.address,o.subtotal_sen,discount);
 expected_tax:=((o.subtotal_sen-discount+(shipping->>'fee_sen')::bigint)*o.tax_bps+5000)/10000;
 if o.delivery_fee_sen<>(shipping->>'fee_sen')::bigint or o.tax_sen<>expected_tax or o.total_sen<>o.subtotal_sen-discount+o.delivery_fee_sen+o.tax_sen then raise exception 'Order does not contain this validated promotion discount';end if;
 insert into promotion_redemptions(promotion_id,branch_id,order_id,code,promotion_name,promotion_version,discount_sen,product_subtotal_sen,eligible_subtotal_sen,snapshot,expires_at)
 values(p.id,p.branch_id,o.id,p.code,p.name,p.version,discount,o.subtotal_sen,(quote->>'eligible_subtotal_sen')::bigint,quote->'snapshot',o.expires_at) returning id into result;return result;
end$reserve_promotion_for_order$;
revoke all on function reserve_promotion_for_order(text,uuid) from public,anon,authenticated,service_role;

create function promotion_order_lifecycle() returns trigger language plpgsql security definer set search_path=public,pg_temp as $promotion_order_lifecycle$declare r promotion_redemptions;s sales;begin
 select * into r from promotion_redemptions where order_id=new.id for update;if not found then return new;end if;
 if old.sale_id is null and new.sale_id is not null then
  if r.state<>'reserved' or r.expires_at<=clock_timestamp() or new.expires_at<=clock_timestamp() then raise exception 'Promotion reservation expired or was released';end if;
  if r.branch_id<>new.branch_id then raise exception 'Promotion branch mismatch';end if;
  select * into strict s from sales where id=new.sale_id and branch_id=new.branch_id;
  if s.discount_sen<>r.discount_sen or s.total_sen<>new.total_sen then raise exception 'Promotion discount is missing from the sale; checkout integration must preserve its snapshot';end if;
  update promotion_redemptions set state='redeemed',sale_id=new.sale_id where id=r.id;
 elsif new.status='cancelled' and new.sale_id is null then update promotion_redemptions set state='released' where id=r.id;end if;return new;
end$promotion_order_lifecycle$;
create trigger promotion_order_lifecycle after update on online_orders for each row execute function promotion_order_lifecycle();
revoke all on function promotion_order_lifecycle() from public,anon,authenticated,service_role;

-- Repeatable owner-only setup: inspect/reconcile future settings while retaining
-- the same ID, publication state, revision history and all redemption snapshots.
create function promotion_seed_cgsvip20() returns uuid language plpgsql security definer set search_path=public,pg_temp as $promotion_seed_cgsvip20$
declare p promotions;payload jsonb;begin
 perform require_promotion_owner();
 select * into p from promotions where code='CGSVIP20' for update;
 if staff_branch()<>'20000000-0000-0000-0000-000000000001'::uuid then raise exception 'CGSVIP20 is reserved for the CHIPSTI main store';end if;
 if found and p.branch_id<>staff_branch() then raise exception 'CGSVIP20 belongs to another branch';end if;
 if p.id is not null and p.name='Cili Gemuk Selayang Customer Special' and p.discount_type='percent' and p.percent_bps=2000 and p.starts_at='2026-11-06 00:00+08'::timestamptz and p.ends_at='2026-11-30 23:59:59.999999+08'::timestamptz and p.minimum_spend_sen=0 and p.discount_cap_sen is null and p.max_redemptions is null and cardinality(p.eligible_product_ids||p.eligible_category_ids||p.excluded_product_ids||p.excluded_category_ids)=0 and not p.allow_manual_stacking then return p.id;end if;
 payload:=jsonb_build_object('id',p.id,'expected_version',p.version,'name','Cili Gemuk Selayang Customer Special','code','CGSVIP20','discount_type','percent','percent_bps',2000,'fixed_discount_sen',0,'starts_at','2026-11-06T00:00:00+08:00','ends_at','2026-11-30T23:59:59+08:00','minimum_spend_sen',0,'discount_cap_sen',null,'max_redemptions',null,'eligible_product_ids','[]'::jsonb,'eligible_category_ids','[]'::jsonb,'excluded_product_ids','[]'::jsonb,'excluded_category_ids','[]'::jsonb,'allow_manual_stacking',false,'publish',false);
 return manage_promotion('save',payload);
end$promotion_seed_cgsvip20$;
revoke all on function promotion_seed_cgsvip20() from public,anon,service_role;
grant execute on function promotion_seed_cgsvip20() to authenticated;

-- Coded campaigns must be changed via the scoped management RPC. The old POS
-- toggle remains unchanged for legacy offers without a code.
alter function retail_action(text,jsonb) rename to retail_action_before_promotions;
revoke all on function retail_action_before_promotions(text,jsonb) from public,anon,authenticated,service_role;
create function retail_action(action text,payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $retail_action$begin
 perform require_role(array['owner','manager','cashier']);
 if action='promotion_toggle' and exists(select 1 from promotions where id=(payload->>'id')::uuid and code is not null) then raise exception 'Use Marketing to change coded promotions';end if;
 return retail_action_before_promotions(action,payload);
end$retail_action$;
revoke all on function retail_action(text,jsonb) from public,anon,service_role;
grant execute on function retail_action(text,jsonb) to authenticated;

-- Initial offer is a DRAFT only: neither migration nor setup publishes it.
insert into promotions(id,branch_id,name,code,percent_bps,starts_at,ends_at,active,publication_status)
values('80000000-2026-4000-8000-000000000020','20000000-0000-0000-0000-000000000001','Cili Gemuk Selayang Customer Special','CGSVIP20',2000,'2026-11-06 00:00:00+08','2026-11-30 23:59:59.999999+08',false,'draft');
-- END 008_promotion_management.sql

-- BEGIN 009_promotion_checkout.sql
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
-- END 009_promotion_checkout.sql
select 'CHIPSTI promotion schema installed; CGSVIP20 remains DRAFT' as result;
commit;
-- END CHIPSTI REVIEWED PROMOTION RELEASE v2 — COMPLETE FILE
