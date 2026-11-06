# CHIPSTI promotion release — backup, rollback and future deployment

**Prepared instructions only. Current authorization is REVIEW AND ISOLATED DEVELOPMENT TESTS ONLY. Do not run production SQL, take a production data export, alter data, publish a campaign, push a deployment branch or deploy until the owner explicitly authorizes the relevant action.**

## Before requesting production approval

1. Establish the actual state from a schema-only export, without customer/order rows or credentials. Obtain separate permission before any production SQL/backup access. The target is **CHIPSTI POS `xmbusapgcxtmdjvnbdgs`**, not the original fruit project. The screenshot's failed query does not establish what earlier queries committed.
2. Compare tables, columns, constraints, triggers, policies, grants and existing function bodies with migrations 001–007 and `supabase/review/baseline-001-007.json`. Review any differences; do not replace custom functions blindly. Check particularly that settings use `branch_id`, promotions already have `updated_at`, and payment/delivery wrappers match 004/006/007.
3. If `promotions.code`, `promotion_redemptions`, or other 008/009 objects already exist, stop. This is a fresh-install package, not a repair for an unknown partial deployment. Prepare and test a target-specific forward migration after inspecting that schema.
4. Verify artifact integrity using `SHA256SUMS`, the complete BEGIN/COMMIT boundaries and the final marker `END CHIPSTI REVIEWED PROMOTION RELEASE v2 — COMPLETE FILE`. Do not paste a selected portion of the file. The generator does not execute SQL.
5. Review the campaign policy: new redemptions must occur while published and valid; accepted orders keep their frozen price for their original hold. Schema installation and campaign publication are separate approvals.

## Backup plan (requires separate authorization; not performed)

- Arrange a brief maintenance window to avoid capturing different accounting states in separate exports. Confirm who will perform restoration and how long it will take.
- Use a verified Supabase managed backup/PITR if the project's plan offers it. Check its timestamp and restore capability; do not assume the free plan includes a recent usable backup.
- If managed backup is unavailable or insufficient, have an authorized operator create an encrypted PostgreSQL logical backup with a supported Supabase/pg_dump procedure. Protect public schema, function definitions, policies/grants, sequences and all accounting/customer data; follow Supabase's instructions for managed auth/storage schemas and role restoration. Record the exact application Git SHA and migration state. Do not put passwords, connection strings or tokens in chat, Git or shell command text.
- A database backup of Storage metadata does not contain uploaded object bytes. Back up required product assets and private payment proof files separately, using authorized secure access. Preserve object paths/access restrictions. Do not make private receipts public.
- Restore the backup into a separate protected staging project/instance and verify schema, product/stock counts, orders/sales/payments/refunds, receipt/order sequence positions, auth access and private Storage access. Keep the backup encrypted, access-controlled and outside this repository/package. A successful test restore is a go/no-go requirement for destructive recovery.
- Record expected data-loss/RPO and recovery-time/RTO with the owner. Neither a production backup nor a full restore test has been performed by this review.

## Deployment sequence — only after explicit approval

1. Reconfirm target project and reviewed schema state. In an approved maintenance window, run the prepared **read-only** `schema-preflight.sql` in CHIPSTI SQL Editor; stop on any mismatch. This query contains no customer data reads and ends with ROLLBACK. Running it still needs authorization under the current instruction.
2. Verify the approved backup/restore evidence. Record baseline counts and business values using a separately reviewed, authorized verification procedure.
3. Apply **only** `promotion-release-reviewed.sql`, as one complete query, to a fresh target through 007. It contains 008 and 009 in one transaction. Do not also run the component migrations or rerun 001–007. It uses a 5-second lock timeout and 120-second statement timeout; on timeout/error, stop and inspect. Do not skip guards or append guessed closing fragments.
4. Confirm the transaction committed, expected functions/RLS/permissions exist, baseline business records are unchanged, and CGSVIP20 is still **DRAFT** with 2000 bps and the reviewed Malaysia dates. Do not create fake production sales, upload test receipts or alter stock to verify it.
5. After separate deployment approval, push the reviewed application commit to `simonpee1997/cgs-premium-fruit-ordering` branch `main`. Confirm Vercel project `cgs-premium-fruit-ordering-ec4o`, team `cili-gemuk-selayang-s-projects`, serves `chipsti.com`. Wait for READY for the exact Git SHA and correct domain alias. Protect all secret environment values; VERCEL_TOKEN is not a database migration credential.
6. Perform authorized read-only checks: storefront catalogue, About, admin sign-in protection, existing original logo/QR assets, owner promotion dashboard, and server quote. Do not treat a quote or uploaded receipt as payment confirmation.
7. Publish CGSVIP20 only after explicit campaign approval. The owner can use Marketing → Promotions → Publish, or an approved operator can run the separate `activate-cgsvip20-after-approval.sql`. That script checks the full expected configuration and target, refuses paused/ended/expired campaigns, and is idempotent for an already published matching offer. Do not run both blindly.
8. Confirm the read-only quote gives 20%, invalid/paused/exhausted/future/expired codes are rejected as appropriate, and exact configured shipping coverage/after-discount totals agree. Real merchant settlement requires an authorized genuine payment and independent receipt-of-funds verification; it was not simulated as a production test.

## Rollback plan

### Before a successful COMMIT

The bundle is a single PostgreSQL transaction. On syntax, preflight, lock timeout or runtime error, do not continue with fragments. Roll back an open failed transaction and inspect state under the approved procedure. Development tests injected an error after the DDL and verified the new schema disappeared and the baseline preflight passed again. A normal uncommitted transaction does not publish an application or campaign.

### After COMMIT, before any campaign use

Keep the campaign draft/unpublished. If installation fails post-checks, do not deploy the new application. Prefer a reviewed forward fix that retains history. A full schema uninstall is permissible only after verifying there are no new offer edits, revisions or redemption/order records to preserve and preparing a target-specific inverse from the authorized backup. This review deliberately does not supply a blind DROP/CASCADE script for an uninspected production schema.

### After offers/orders have been used

1. With incident authorization, pause affected codes or close new online ordering while preserving POS operation and accepted orders. Do not change already agreed discounts or mark unverified transfers paid.
2. Roll back the application UI to a verified compatible commit if necessary, but **retain the new discount columns, frozen snapshots, ledger and payment-confirmation implementation**. Restoring the old zero-discount confirmation SQL would corrupt or block discounted orders. Outstanding orders must be processed with compatible logic and verified funds.
3. Do not drop coded promotions, revision/redemption tables or new columns, and do not restore isolated old tables over newer sales/payments. Fix forward with a reviewed migration that preserves accounting history.
4. Restore a complete backup only for a severe incident with explicit approval of the potential loss of post-backup orders/payments. Use the tested restore procedure, reconcile merchant funds and stock, restore sequences and private proof access, and validate before reopening.

No rollback, production backup, live preflight or deployment is authorized or executed by this document.
