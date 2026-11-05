# Public shop and staff POS

This release adds online ordering to the existing POS. It does not replace the existing products, sales, staff accounts or audit history.

- `/`: public product catalogue, product/SKU search, basket and customer checkout.
- `/admin`: existing authenticated staff POS, inventory, reports and operations, with a new **Online Orders** screen for owners/managers.
- `/order/<random tracking token>`: private customer order status, payment instructions, reference submission and printable order summary/payment receipt.

## Rollout order — approval required

The owner requires approval before database migrations or production deployments. Do not push application changes to the live production branch until the owner approves the release and migration 004 has been applied. The live project is `chipsti-pos`; the original fruit database must remain untouched.

1. Review and apply **only** `supabase/migrations/004_online_store.sql` to the existing CHIPSTI project. Migrations 001–003 are already applied. Do not rerun them. Migration 004 adds shop settings, orders, order lines, events, rate buckets, RLS policies and reservation protection. It does not delete the existing catalogue or staff records. The shop starts with ordering **disabled**.
2. Ensure Vercel has the two public project variables and a **server-only** `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` from the same CHIPSTI project. The existing Supabase integration normally provides these. Never put a privileged key in a `NEXT_PUBLIC_` variable or share it in chat. The server uses it only in the private shop API; the browser receives no privileged key.
3. Deploy the approved application update. The existing POS moves from `/` to `/admin`; bookmark the new staff address. The staff PWA manifest starts at `/admin`. Supabase session refresh runs for `/admin` and staff API routes.
4. Sign in as owner at `/admin`, open **Online Orders → Online shop settings**, and configure the real pickup address, contact phone, delivery instructions, flat delivery fee, serviceable postcode prefixes and bank/QR payment details. Empty postcode prefixes mean all five-digit Malaysian postcodes; set prefixes to limit the area. Delivery requires transfer or DuitNow details. Cash is supported only on eligible pickup orders. No courier rates are fetched automatically.
5. Enter actual stock through audited Inventory adjustments. Online ordering does not invent stock; products with zero available stock cannot be bought.
6. Enable online orders when the business settings and stock are correct. Configure Supabase Auth Site URL/allowed redirects for the final staff domain, and verify public signup remains off.
7. Test the hosted acceptance checklist below before announcing online sales.

Bank account details and QR instructions are returned only on private order links. The anonymous catalogue includes payment-method availability flags, safe product details/prices and current available quantities; it includes no costs, customer data, bank account numbers or order history.

## Pickup and delivery

Both options are configurable. Store pickup shows the configured collection address. Delivery requires a complete address, a five-digit Malaysian postcode within the configured prefixes, and bank transfer/DuitNow payment. A single flat delivery charge is recalculated by the database; it is not a live courier quote. Delivery timing/instructions are supplied by the owner. Delivery dispatch and pickup readiness are marked manually in the admin area.

No card gateway, automatic bank verification, automatic courier booking or email/SMS sending is claimed. Customers save their private order URL to check status; the page polls every 30 seconds. Staff see new orders through the existing 30-second refresh and can refresh immediately. Customer information is used to fulfill the order, with marketing consent off.

## Order and inventory lifecycle

An order starts as `awaiting_payment`, reserving its items for 24 hours without creating a paid sale or deducting booked inventory. Customer bank/QR reference submission changes it to `payment_submitted`, which is still unpaid. Cash-on-pickup orders wait for collection/payment confirmation.

Order placement locks inventory rows in sorted UUID order and validates availability against all unexpired reservations. A database trigger applies the same reservation protection to the existing POS checkout and stock adjustments, preventing staff or online customers from selling reserved units. Cancellation and expiry release reservations. Expiry is calculated in queries; no background job is required to free stock. Expired/cancelled orders cannot be confirmed as paid. If a customer pays after expiry, staff must contact them, recheck stock and process an appropriate new order/sale or manual refund.

An owner/manager with an open cashier session verifies actual funds received and confirms payment. In one database transaction this releases the order's reservation, deducts inventory, snapshots costs at payment confirmation, creates the sale/items/payment/stock movements, assigns a receipt sequence and records the confirming staff member. Quoted product prices, delivery fee, tax and payment instructions are frozen when the customer places the order. Current product/tax changes do not silently alter an existing quote. Idempotency keys prevent duplicate order placement and repeated confirmation from creating additional sales.

Paid orders can become ready for pickup, dispatched or completed. A paid order cannot be silently cancelled; use the existing Refunds module. Delivery fees are non-stock sale lines with zero product cost. A fee refund never restocks inventory. Full-sale voids reverse remaining quantities/fees through the existing audited refund mechanism. A fully refunded order is shown as refunded to the customer and cannot be fulfilled. Partial-refund quantities are shown to staff and customers.

## Accounting

Unpaid orders/reservations do not appear as revenue or paid receipts. Confirmed sales and refunds use the existing reporting contract: net revenue excludes tax and is reduced by refunds on their event dates. Delivery fees are sale revenue; courier expenses/fees are not modeled as product COGS. Product profitability tables concern products, while headline totals include delivery revenue. Historical product cost comes from the payment-confirmation snapshot. A pending customer document is clearly marked **Order summary · not a payment receipt**. Paid receipts include CHIPSTI's SSM identity and the actual cashier/confirmation time. LHDN integration remains outside this release.

## Security and abuse controls

- Anonymous users have no table access to staff, costs, customers or online orders. Public catalogue access is a whitelisted security-definer RPC. Private order writes/status require the server-only service credential and expose narrow routes.
- Staff actions still use the staff session, branch checks, roles and RLS; the public service credential is not used for staff management or payment confirmation.
- The server validates with Zod; PostgreSQL independently validates money, stock, quantities, allowed fulfillment/payment methods and state transitions. It computes prices, tax and delivery charges using integer sen.
- Public mutation routes reject foreign origins and large bodies. A honeypot and database-persisted request limits supplement Vercel's platform protections. Rate buckets use HMAC hashes of the Vercel-provided client address, not stored raw IP addresses. The default limits are 20 order/reference requests per hour and 10 successfully placed orders per hour per bucket; failures do not create orders. For high traffic, tune limits and consider Turnstile/WAF rules appropriate to actual abuse.
- Customer tracking tokens are random UUIDs independent of order numbers. Their pages are noindex/no-referrer with no-store responses. Anyone with the token can view the limited order summary; customers should keep the URL private. Public status excludes customer email/phone and confidential staff data.
- Bank/QR references are customer claims until manually verified. Never treat a submitted reference as automatic settlement. Refunds/voids in the POS record the refund; actual bank/card refunds must be performed through the provider.

## Validation and remaining hosted checks

Local verification on 5 November 2026: 36 unit/database tests and 33 Chromium browser tests passed across desktop, tablet and mobile viewports. ESLint, TypeScript and the production build passed. Browser network fixtures are isolated from the production database.

Automated PostgreSQL tests cover public table denial, role restrictions, stock reservations, POS reservation protection, stale totals, duplicate submissions, postcode restrictions, cancellation/expiry, quoted prices/tax, confirmation, delivery-fee refunds and voids, and rate limits. Browser fixtures exercise the public collection and customer checkout separately from the real SQL tests; no test fixtures ship as production data.

Before launch, verify hosted Auth/session refresh, owner settings and image uploads, zero-stock behavior, both pickup and delivery with the configured prices/fee/tax, status/reference submission, manual payment confirmation, historical receipt/reports, partial and full refunds, reservation contention with simultaneous real PostgreSQL sessions, and printed receipts. Test iPad/Safari and real Windows/mobile devices; Chromium viewport coverage does not prove every device/browser or thermal printer. Test backup restoration including new online-order tables and associated Auth/Storage data. No production migration/deployment or hosted payment has been performed as part of local development alone.
