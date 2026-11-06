# Development and rollout checklist

## Implemented

- [x] Next.js App Router, TypeScript, Tailwind and responsive cream/espresso theme with dark mode
- [x] Supabase password authentication, cookie refresh and server authorization
- [x] Deny-by-default RLS; confidential cost separation; secure administrative owner bootstrap
- [x] Ordered migrations, branch-aware transactional tables, role definitions, product/category seed
- [x] Search/scanner input, stock-aware cart, integer item/order discounts and promotions
- [x] Cash/manual non-cash/mixed tender recording and exact server checkout
- [x] Atomic inventory deduction, historical snapshots, receipt sequence and retry safety
- [x] Own held orders, sale history and receipt printing/WhatsApp compose link
- [x] Owner product editing, photo upload, category/barcode/archive/low-stock settings
- [x] Audited stock adjustments, damaged/expired movement reasons and movement history
- [x] Supplier creation, purchase order creation and one-time goods receiving
- [x] Customer creation/attachment/contact search; consent off by default
- [x] Date-filtered dashboard, profit/cost views, category/cashier/payment breakdowns and daily bars
- [x] CSV / Excel exports and print-to-PDF reports
- [x] Quantity-limited refunds with optional restock and audited compensating voids
- [x] Cashier sessions, cash in/out, count reconciliation and independent closing approval
- [x] Staff provisioning/deactivation/roles and owner audit trail
- [x] PWA manifest/non-caching worker, deployment and recovery documentation

## Verified in this workspace

- [x] SQL migrations execute in embedded PostgreSQL with Auth/Storage schema harness
- [x] Automated tests for RLS, discounts, stock, idempotency, refunds, voids and closing
- [x] Lint, TypeScript and optimized production build
- [x] Unconfigured and test-fixture cashier UI checks on desktop/tablet/mobile, manifest and foreign-origin rejection

## Required before real retail use

- [ ] Supply Supabase URL/public key in secure environment settings; apply migrations to staging
- [ ] Provision initial owner, manager and cashier using separate Auth identities
- [ ] Hosted sign-in, sign-out, expiry/refresh, disabled-account and password-recovery checks
- [ ] Direct REST and RPC permission tests for all roles, anonymous users and unaffiliated users
- [ ] Concurrent multi-connection last-unit checkout, refund and close-session contention tests
- [ ] Full hosted sale → inventory → receipt → refund → reports → closing acceptance run
- [ ] Hosted image upload/read checks; confirm private documents cannot be uploaded by cashiers
- [ ] Date-boundary, discount limits and tax reconciliation confirmed with the business accountant
- [ ] Real USB/Bluetooth scanner, iPad touch layout and 58/80 mm thermal-print tests
- [ ] Actual Android/iPad PWA installation and network-loss behavior checks
- [ ] Provider settlement/refund procedures trained; no automatic verification is implied
- [ ] Backup restoration into an isolated project and reconciliation of recovered records
- [ ] Large-dataset/load tests and security review appropriate to the intended number of stores
- [ ] Production Vercel/Supabase deployment and environment settings reviewed by owner

## Explicitly outside current release

Automatic payment integrations, LHDN integration, bundles, automated loyalty rules, branch-switching UI, camera scanning, self-service staff recovery UI, silent printer drivers and scheduled backup automation. Do not advertise these as working.

## Online storefront update (local implementation; rollout pending approval)

- [x] Public shop at `/` and staff POS at `/admin`
- [x] Pickup/delivery order placement with server totals and frozen quotes
- [x] Unpaid stock reservations honored by existing POS/stock adjustments
- [x] Private customer status/reference submission and manual payment confirmation
- [x] Owner fulfillment/payment settings and manager online-order controls
- [x] Delivery fee receipts/refunds/voids without service stock
- [x] Public-read minimization, private server credentials and persisted abuse limits
- [ ] Owner approval for migration 004 and production release
- [ ] Apply migration 004 to CHIPSTI only; configure actual fulfillment/payment details
- [ ] Deploy approved update and verify live Auth, orders, receipts, refunds and reports
- [ ] Multi-session PostgreSQL contention and real iPad/Safari/hardware verification

## Quantity controls and RM300 delivery release

- [x] Card minus/quantity/plus, zero removal, stock limits and filter/basket synchronization implemented.
- [x] Exact-postcode delivery areas and owner-editable standard fees; no assumed Klang Valley coverage.
- [x] Frontend estimates and authoritative database rules for threshold, location, fallback charges, pickup and tax.
- [x] Existing-order snapshots and paid-sale/refund behavior covered locally.
- [ ] Owner approval for migration 006 and production release.
- [ ] Apply 006 to CHIPSTI POS only, before the application deployment.
- [ ] Owner configures verified Klang Valley coverage and actual fees.
- [ ] Hosted checkout/payment/refund and actual iPad/Safari/device checks.
