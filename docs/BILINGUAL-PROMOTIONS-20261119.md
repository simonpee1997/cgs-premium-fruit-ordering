# CHIPSTI bilingual receipts and promotion codes — 19 November 2026

Target: `chipsti.com`, GitHub `simonpee1997/cgs-premium-fruit-ordering`, Supabase `xmbusapgcxtmdjvnbdgs`. This release follows the installed nationwide-delivery migration 008. The earlier review branch's 008/009 promotion bundle must not be pasted or replayed.

## Behavior

- Saved database English names precede Chinese names on POS receipts/invoices, current-order lines, digital receipts and PDF/printed layouts. New sale lines snapshot English names. Existing lines resolve the same product's current English name only if its Chinese name still matches; original financial history is never rewritten. All 11 currently published products have saved English names.
- CGSVIP20: 20% off products, no minimum or cap, all products, online and staff POS; active until **31 December 2026 23:59:59.999999 Malaysia time**, rejecting 1 January midnight. Money is calculated in integer sen with nearest-sen rounding. Shipping is excluded from the product discount; existing free-delivery eligibility continues to use the after-discount merchandise total. No other code or manual discount can be combined at POS.
- The owner selected **anyone who knows the code**. No identity, previous-purchase or phone verification is required. The code is not advertised in the public catalogue; possession of it is sufficient.
- Admin: **Settings → Promotions**. Create/edit offers, set percentage/expiry/minimum/usage limit, publish/pause/resume/end, and review/export online and POS redemption history. Existing uncoded POS promotions remain available separately.
- Quotations are advisory. Both checkout paths reprice from database products, validate status/date/scope and reject inconsistent payments in the database. A promotion row lock serializes online reservations and POS redemption against one shared limit. Paid/refunded uses remain counted; expired unpaid reservations cease consuming quota. An accepted online order retains its frozen price for its original reservation period, without treating a payment proof as verified funds.

## Validation

122 unit/database checks passed; 36 browser checks passed on desktop, tablet and mobile, including owner management, code entry, online discount/shipping totals and bilingual PDF downloads at 58mm and 80mm. Native PostgreSQL tests use independent connections to verify a single final slot across concurrent POS/online checkout, expiry while waiting, and the exact Malaysia year-end boundary. They also apply the complete release against the actual production function definitions copied into an isolated database.

The development fixture SQL is not a real payment. Production checks must be read-only quotations, authentication checks and browser-intercepted UI fixtures; do not create fake merchant sales to verify deployment.

## Release and rollback

`node scripts/build-current-promotion-release.mjs` regenerates the complete atomic SQL `supabase/releases/20261119-bilingual-pos-promotions.sql`. It checks the schema fingerprint observed on 19 November, business/branch identity, trusted function ownership/search paths, RLS and untrusted schema CREATE permissions before making changes. A short lock timeout fails closed rather than waiting indefinitely. All transactions/functions/blocks are validated by native PostgreSQL, not just text matching.

The migration privately preserves replaced function definitions/ACLs, previous promotion policies and existing offers under `chipsti_release_backup` (no public/anonymous/staff/service-role schema access). Existing sales, sale items, payments, refunds, orders, products, stock and customer rows are locked briefly and fingerprinted before/after, excluding only newly added nullable/default snapshot columns. Any unexpected historical change raises an exception and rolls back the whole migration. These private definition backups are **not** a full database/PITR backup.

Normal builds perform no SQL. `scripts/apply-promotion-release.mjs` only runs with the exact approved production Git SHA in `CHIPSTI_PROMOTION_RELEASE_SHA`, verifies the Supabase target and TLS certificate, and applies the complete transaction once. Sensitive existing Vercel credentials remain inside its build environment. After commit it verifies the campaign and a read-only 20% quotation. A version marker makes a deliberate retry idempotent.

1. Push the tested release branch. Run an unaliased production-context Vercel build with the exact-SHA release flag, preserving existing protected integration credentials. Custom-domain assignment stays disabled.
2. Confirm `CHIPSTI_PROMOTION_RELEASE` reports success and the build is READY. If any preflight or migration check fails, stop; never bypass guards or paste fragments.
3. Fast-forward GitHub main to that same tested SHA and allow the ordinary Vercel workflow to publish without migration flags. Verify its READY deployment has the `chipsti.com` alias and run read-only live checks.
4. Before COMMIT, any error rolls back schema and data changes. After commit, prefer pausing a faulty code through the dashboard and fixing forward. The previous website revision remains compatible with the additive schema, but must not be used to settle discounted online orders through an older zero-discount SQL implementation.
5. Retain new snapshots and redemption history after use. Do not drop columns/tables or restore isolated old accounting tables. Restore an entire database only from a separately verified full backup with explicit acceptance of losing newer activity. The release performs no destructive recovery and does not claim an independently tested full production backup exists.
