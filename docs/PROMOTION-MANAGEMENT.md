# Phase 1: promotion management

Local review only. Do not run migration 008 on production or deploy without the owner's explicit approval. The separately approved Phase 2 must connect customer checkout to this engine; this phase does not accept codes in existing checkout or redesign the storefront.

## Owner workflow

Admin → Marketing → Promotions. Create an offer, save a draft, then publish when ready. Edit, duplicate (new code/unpublished draft), pause, resume, end, delete unused drafts, simulate and export CSV. Expiry and start inputs/display use Malaysia time; the database stores timestamps with time zone and server time determines live status. Dashboard refreshes every 30 seconds. Optimistic version checks reject stale saves.

The essential form asks for name, unique case-insensitive code (or generate one), percentage/fixed RM discount, start and expiry. Advanced settings provide optional minimum product spend, discount cap, overall redemption limit, product/category eligibility/exclusions and manual-discount stacking. Category/product inclusions are ORed; exclusions win. Defaults: all products, no minimum/cap/quota, one code per order, no stacking. No login, membership, phone matching, OTP or identity-based limits are introduced. Delivery and tax are never discounted by the code.

The RM200 live estimate is illustrative. The owner simulator uses current server product prices and the same authoritative evaluator; an optional Malaysia date previews validity, including drafts. Simulations create no orders, reservations, redemptions or sales and do not predict future redemption counts.

## Migration and safety

`supabase/migrations/008_promotion_management.sql` requires migrations through 007 and checks CHIPSTI business identity. It extends the existing promotions table instead of replacing it. Existing uncoded POS offers remain available. Coded offers always have the old `active` flag false, so the legacy POS discount shortcut cannot bypass coded eligibility or quotas. Marketing management and reports require an active owner in the same branch. No additional dependency or environment variable is needed.

The migration creates CGSVIP20 as a **draft**:

- Cili Gemuk Selayang Customer Special; 20% off products.
- Starts 6 November 2026 at 00:00:00 MYT.
- Ends 30 November 2026 at 23:59:59 MYT (inclusive).
- All products; unlimited uses; no minimum or cap; no stacking.

Owner-only `promotion_seed_cgsvip20()` reconciles these settings without duplicating the code. Exact matches are no-ops. Reconciliation preserves the ID, publication state and historical snapshots; do not rerun the entire migration as a seed operation.

Revision snapshots retain every change. Redemption snapshots retain the discount actually applied to an order; editing an offer changes future evaluations only. Reports show paid redemptions/discounts, gross associated sale totals (including delivery/tax) and net sale totals after refunds; active unpaid holds are separate. CSV includes both offer summaries and redemption rows, with formula-safe text fields. No customer contact information is exported.

## Phase 2 contract (not wired yet)

The read-only `/api/shop/promotion` accepts only code and product IDs/quantities. It requires same origin, applies rate limiting and evaluates server prices/server now; it accepts no customer-supplied price, discount or validity date. It does not consume a redemption or create an order.

Private `reserve_promotion_for_order` locks the promotion, enforces quota, validates an already discounted order's subtotal, after-discount shipping, tax and total, and creates an idempotent hold. It has no client or service-role execute grant. The eventual server checkout SQL must call it atomically with order creation, preserve the discount into the sale, and reject late/expired reservations before payment confirmation. Cancelled unpaid orders release their holds; expired holds do not consume quota. Paid orders count as redeemed; refunds reduce net sales without restoring the code slot. Existing orders without a promotion ledger remain unchanged.

Phase 2 must test actual concurrent checkouts in PostgreSQL and integrate promotion snapshots into all order/payment/refund paths before enabling the customer code field. PGlite tests cover the contract locally, including quota, idempotency, cancellations, expired holds and historical reporting. No hosted database writes, deployment or real payment is part of Phase 1 verification.
