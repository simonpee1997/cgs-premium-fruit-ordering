# Promotion/storefront release verification

Release scope: owner promotion management (008), customer promotion checkout (009), sticky order summary and compact product-first homepage. The owner explicitly approved completing Phases 2 and 3 and publication.

## Validation evidence

- `npm test`: 93 unit/database tests pass, including all existing POS, delivery, inventory and private QR-proof regressions with migrations 008 and 009 applied to isolated databases.
- `npm run test:browser`: 81 tests pass across desktop, tablet and mobile. Includes promo apply/remove/error, after-discount RM300 shipping, pickup, exact submitted totals, six-column wide grid, visible first product row, quantity synchronization, keyboard sheet dismissal, admin access, original QR bytes/dimensions and manual payment verification.
- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `tests/postgres-concurrency.mjs`: passed on isolated PostgreSQL 18, with two independent connections. The second transaction waited on the actual lock, then failed when the final slot was consumed. Simultaneous retries returned the same order; exactly one order and one redemption existed. No production database was used.

The optional concurrency check requires an isolated Unix-socket PostgreSQL instance under `/tmp/chipsti-postgres`, port 55432, user `chipsti_test`, and an external temporary `pg` client. It is intentionally excluded from normal CI and refuses arbitrary remote hosts. Reinitialize this disposable database before rerunning because it creates fixture roles/schema. It introduces no application dependency.

## Deployment sequence

1. Confirm the database is CHIPSTI POS `xmbusapgcxtmdjvnbdgs`, not the fruit project. Apply 008 then 009 as reviewed migrations. The atomic combined release SQL is generated outside Git at `/workspace/CHIPSTI-promotion-release.sql` for a database currently through 007. If 008 was already applied, apply only 009 instead.
2. Verify both functions exist, coded CGSVIP20 has its approved settings and lifecycle, and the original product/inventory/order/sale counts are unchanged by the migration. No real test orders or merchant payments should be created.
3. Push the verified release commit to GitHub `simonpee1997/cgs-premium-fruit-ordering` branch `main`. Vercel project `cgs-premium-fruit-ordering-ec4o` (team `cili-gemuk-selayang-s-projects`) is linked to that production branch and serves `chipsti.com`.
4. Verify Vercel READY for that exact Git SHA and chipsti.com alias, homepage and About, admin sign-in, public catalogue, and read-only promotion/order quotes. Confirm original logo/QR assets and authentication protection. Real payment settlement still requires merchant verification.

`VERCEL_TOKEN` is configured securely. Database migration publication additionally requires a securely configured `SUPABASE_ACCESS_TOKEN` or the owner applying the reviewed SQL in Supabase. Never paste tokens into chat or commit them. Do not publish the new checkout before its required migration is applied.
