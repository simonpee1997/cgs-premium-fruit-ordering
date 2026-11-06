-- CHIPSTI READ-ONLY FUNCTION METADATA DIAGNOSTIC
-- SELECT only. No migration, data change, campaign activation or deployment.
-- The eight function bodies/canonical definitions in the supplied export match
-- the reconstructed baseline. This identifies the remaining metadata mismatch.
WITH expected(signature, source_md5, definition_md5, return_type, security_definer, settings) AS (
 VALUES
  ('manage_online_order_before_delivery(text,jsonb)', 'b9018ea82f1d2a5ab394f1a04505503e', '50dee4b6bd79d009dd931bd4f42c3ec6', 'uuid', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('online_order_status(uuid)', '6ad8f4812f1542f8d1debecaf4295123', '912fd3aa7749ab07506aa8626c73e7a1', 'jsonb', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('place_online_order(jsonb,text)', '2b553ca3560595f2eb3464dc81402bf7', '7ca2184e52ee863dbe46c31751b201a5', 'jsonb', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('quote_online_order(jsonb)', 'cee53c9b6e58151b304e9acf23697082', '20ef8551a1aa054d67bbb8ef470fbfd5', 'jsonb', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('require_role(text[])', '634e36a24b6b7685dfcf06afd4781bfc', '5652d68f0c01b5e434e954a804e93962', 'void', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('retail_action(text,jsonb)', '0c627b1107148a3529e6d55ada41071e', '29fcbcd29b0ca0a584b3dc4cc917cb0a', 'uuid', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('staff_branch()', 'e675ec409d7a3cb89266119a52808537', 'b5f3a5bfa80f9e21b846f8fb071e3358', 'uuid', true, ARRAY['search_path=public, pg_temp']::text[]),
  ('staff_role()', '4ae090d7e0c7db9f886a27b0a5edd9eb', '7a420e30be66100882f5da017cea560e', 'text', true, ARRAY['search_path=public, pg_temp']::text[])
)
SELECT
 e.signature AS function_name,
 current_setting('server_version') AS server_version,
 current_setting('search_path') AS editor_search_path,
 p.oid IS NOT NULL AS function_exists,
 md5(p.prosrc) IS NOT DISTINCT FROM e.source_md5 AS body_matches,
 md5(pg_get_functiondef(p.oid)) IS NOT DISTINCT FROM e.definition_md5 AS exported_definition_matches,
 p.prosecdef IS NOT DISTINCT FROM e.security_definer AS security_definer_matches,
 format_type(p.prorettype, NULL) AS actual_return_type,
 e.return_type AS expected_return_type,
 format_type(p.prorettype, NULL) IS NOT DISTINCT FROM e.return_type AS return_type_matches,
 p.proconfig::text AS actual_settings_literal,
 to_jsonb(p.proconfig) AS actual_settings_json,
 array_dims(p.proconfig) AS actual_settings_bounds,
 e.settings::text AS expected_settings_literal,
 p.proconfig IS NOT DISTINCT FROM e.settings AS exact_settings_match,
 ARRAY(SELECT unnest(p.proconfig)) IS NOT DISTINCT FROM e.settings AS settings_values_match,
 r.rolname AS function_owner,
 coalesce(r.rolname NOT IN ('anon','authenticated','service_role'), false) AS owner_allowed
FROM expected e
LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure('public.' || e.signature)
LEFT JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
ORDER BY e.signature;
-- END READ-ONLY FUNCTION METADATA DIAGNOSTIC — COMPLETE FILE
