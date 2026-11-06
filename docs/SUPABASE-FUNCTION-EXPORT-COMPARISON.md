# Supabase function export comparison — 7 November 2026 (Malaysia)

All eight supplied `pg_get_functiondef` exports match the isolated 001–007 baseline's canonical definitions byte-for-byte. All eight extracted function bodies also match the original MD5 fingerprints. No customization of the exported order/payment function logic was found.

The earlier preflight error combines body, return type, security mode and raw `proconfig` array comparisons. The supplied export does not expose raw `proconfig` values/bounds, so the exact failing metadata comparison is not yet established. Do not change the production functions or remove the compatibility guard based on this error.

A prepared SELECT-only diagnostic reports each comparison separately, including raw setting-array bounds, settings values, canonical definition match and owner role. It reads no customer/order rows and performs no writes. Production migrations and deployment remain unapproved.

The uploaded CSV is retained privately in the workspace and is not committed or published. Only the comparison fingerprints and the read-only diagnostic are added to the review branch.
