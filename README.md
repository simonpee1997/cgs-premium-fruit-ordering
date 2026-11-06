# CHIPSTI ENTERPRISE · Retail atelier

A Next.js App Router / TypeScript / Tailwind POS backed by Supabase Auth, PostgreSQL and Storage. Business identity: **202603232290 (RA0139100-V)**. MYR throughout; reporting uses **Asia/Kuala_Lumpur**. All authoritative financial calculations use integer sen in PostgreSQL; forms accept RM and percentages.

## Public shop and online orders

The updated application serves the public collection and online checkout at `/`, with staff POS at `/admin`. It supports store pickup and delivery, pending stock reservations, customer order-status links, manual bank/DuitNow references and staff payment confirmation into the existing sales/receipt/reporting system. See [online-shop setup and rollout](docs/ONLINE-SHOP.md) before applying migration 004 or deploying. Online ordering starts disabled until the owner configures fulfillment/payment details and actual stock. The new migration and production release require owner approval.

## Quantity controls and delivery promotion

The public shop includes synchronized product-card quantity selectors and owner-configured exact-postcode areas for free delivery at RM300 within Klang Valley. See [setup and verification](docs/QUANTITIES-AND-DELIVERY.md). Migration `006_delivery_areas.sql` is required before deploying this release; new delivery areas start empty, and the existing flat fee remains the fallback. Apply only with explicit production approval. No new environment variables or dependencies are required.

## Run locally

Requires Node.js 24 (.nvmrc and Vercel runtime are pinned to 24.x), npm, and a Supabase project. Use the existing checkout; cloud tasks are isolated already, so a worktree is unnecessary.

```sh
cd /workspace/cgs-premium-fruit-ordering
npm ci
cp .env.example .env.local
# Edit .env.local with your project's public URL and publishable key.
npm run dev
```

Without configuration, the app shows explicit setup instructions. It does not invent products, transactions, users or dashboard activity. The SQL seed imports the exact 11 supplied Chinese product names, SKUs, costs and selling prices with **zero stock**. Product package illustrations are decorative fallbacks, not supplied product photographs.

## Supabase setup

1. Create a Supabase project. In its SQL editor run these migrations **once, in order**:
   - `supabase/migrations/001_core.sql`: schema, RLS, transaction functions, product/category seed, Storage bucket.
   - `supabase/migrations/002_voids.sql`: audited full-sale voids through compensating refunds.
   - `supabase/migrations/003_metadata.sql`: role definitions, update timestamps, historical category snapshots.
   - `supabase/migrations/004_online_store.sql`: public catalogue, private customer orders, pickup/delivery settings, reservations and confirmation into paid sales. On an already installed CHIPSTI project, apply only the unapplied migration; do not rerun the first three.
2. In Authentication settings disable public signups. Set the production Site URL and permitted redirect URLs. Use Supabase's email invitation / user creation tools to create the first owner. No public application endpoint creates elevated accounts.
3. Copy that Auth user's UUID and run the following **as the database administrator in the SQL editor**, replacing the placeholder UUID and display name:

   ```sql
   insert into public.profiles (id, display_name, branch_id, role)
   values ('REPLACE-WITH-AUTH-USER-UUID', 'Store owner',
     '20000000-0000-0000-0000-000000000001', 'owner');
   ```

   Never expose the SQL editor credentials or a service-role key to the browser. The public order API requires a server-only service key; staff POS operations continue to use the staff session. Anonymous Auth users receive no application access without an active staff profile.

4. Set these environment variables and restart Next.js:

   | Variable                                             | Value                                                                         |
   | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`                           | Project's HTTPS URL                                                           |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`               | Project publishable key (or legacy anon key)                                  |
   | `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | Server-only order API credential, normally injected by the Vercel integration |

   For a restricted cloud environment, add your exact project hostname (for example, `PROJECT-REF.supabase.co`) to its network allowlist so server-side Auth and database requests can reach it.

   These two public variables are intended for browser use. Keep real credentials out of Git. Application security comes from Auth, server validation and RLS, not secrecy of the publishable key.

   For the online order API, also supply the **server-only** `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`; the Vercel integration normally supplies it. Never prefix a privileged key with `NEXT_PUBLIC_`.

5. Sign in as owner at `/admin`. Add actual inventory via **Inventory → Adjust stock**, with a reason. Zero stock prevents checkout.
6. Create Auth users for staff through Supabase, then assign their UUIDs through **Staff Management**. A second manager/owner is required to approve another staff member's closing. Owners cannot alter their own privileges through the app.
7. Confirm the `product-images` bucket was created. Uploads accept JPEG, PNG and WebP up to 5 MB; only owners may upload. Product images are intentionally public, so upload product photos only, never customer documents.
8. Open **Cashier Closing → Open session**, enter opening float, then use **Point of Sale**.

Configure custom SMTP, password policies, authentication rate limits, MFA for privileged accounts where available, and a recovery procedure in Supabase before deploying. Staff password recovery is administered through Supabase; this release has no self-service recovery UI.

## Daily workflow

- Search by SKU, Chinese/English name or barcode. USB/Bluetooth scanners acting as keyboards can scan into the search field and send Enter. Scanning adds a unique matching product.
- Add available products, adjust quantities, select an optional customer and apply item/order discounts. Owner-configured promotions are validated in the database. Cashier discount limits apply to the combined discount; larger discounts require a manager to sign in and complete checkout. The app does not accept an unverified manager PIN.
- Record cash, DuitNow QR, transfer, debit, credit or mixed payments. Non-cash references are required. **All non-cash payments are cashier-confirmed manually**; confirm funds in your bank/provider app. No payment provider settlement or refund is performed automatically.
- Checkout recalculates current prices and tax, locks inventory in deterministic order, validates payment, records historical prices/costs/categories and stock movements, and allocates a receipt sequence in one database transaction. A unique request UUID makes retries idempotent. Receipt sequence gaps are normal and numbers are never reused.
- Hold/resume your own carts. Held carts do not reserve stock or prices. Resumed carts are checked again at checkout.
- Review completed sales, print 58 mm / 80 mm receipts or select A4 and save as PDF in the browser. WhatsApp sharing opens an editable message; the user sends it. No message is sent automatically.
- Managers/owners can refund specific quantities with a reason. Restocking is **off by default**; explicitly select it only for inspected sellable goods. Void refunds all remaining quantities atomically while preserving the original sale. Perform actual bank/card refunds separately and reconcile references with the provider.
- Purchase orders currently contain one product line per order. Receiving is atomic and can occur only once. Purchase cost is saved on the order; it does not silently change the product's current cost. Optional batch/expiry metadata is recorded on stock adjustments; this is not a FIFO/FEFO stock allocator.
- Close the session with actual counted cash. Expected cash = opening float + cash sales − cash refunds + cash in/out. A different manager/owner approves the submitted closing; approved sessions cannot be edited through app APIs.

## Authorization and accounting

See [security and accounting](docs/SECURITY.md). Cashiers can create sales, see their own receipts/sessions, hold orders, and access customer records for sales. Managers operate inventory/purchasing/refunds/closing and branch sales reports. Owners also manage products/costs, staff, tax settings and profit reports. Costs are stored in separate owner-readable tables; hiding a UI field is not the security boundary.

Dashboard net revenue means sales less discounts and refunds, **excluding tax**. Refunds appear on their refund date, not by rewriting the original sale date. COGS uses historical cost snapshots. Restocked returns reverse COGS; damaged/non-restocked refunds retain their cost. Gross profit is net revenue less this net COGS. Operating expenses, bank fees and income tax are not included. Product profitability and category views are explicitly labeled before order discounts/tax/refunds; payment views show original recorded tenders, with refunds reported separately. See limitations below.

## Tests and build

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
# In another terminal, while the unconfigured production server is running:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`npm test` runs real embedded PostgreSQL (PGlite) migration/RLS/financial tests, not mocked SQL. Tests supply minimal Auth and Storage schemas; they do **not** validate the hosted Supabase Auth service or Storage API. The crypto extension declaration is omitted in this embedded test harness because the engine already supplies UUID generation. Production migrations keep `pgcrypto` enabled.

The browser command automatically starts isolated servers on ports 3000 and 3001 when needed; build first and use an unconfigured test environment. GitHub Actions runs lint, type checks, SQL/unit tests, build and browser checks on pushes and pull requests.

Browser checks cover the honest unconfigured screen, Chinese product search, cart quantities, RM discount entry, payment UI, role-filtered navigation and layout at desktop/tablet/phone widths, the manifest/service worker, and foreign-origin mutation rejection. Cashier UI checks intercept API responses with test-only fixtures on an isolated second server; no fixture data is loaded into the production application. Install Chromium or adjust `CHROMIUM_PATH` for another system. These checks do not prove authenticated hosted checkout or physical printer behavior. See `docs/CHECKLIST.md` for the verification boundary.

## Vercel deployment

1. Import the GitHub repository into Vercel with the repository root as the project root.
2. Select the Next.js framework preset and Node 24. The checked-in `vercel.json` runs `npm ci` and `npm run deploy:check && npm run build`; the preflight rejects missing, placeholder or secret public configuration.
3. Set both public Supabase variables and the server-only service key in the intended Production/Preview environments **before building**. Public variables are bundled at build time; redeploy after changing them.
4. Apply the migrations to the corresponding Supabase project, provision owner access and enter actual stock as above. Use a separate Supabase project for staging.
5. Set the final Vercel domain in Supabase Auth settings. Redeploy, sign in and execute the deployment checklist against staging first.
6. Review Supabase network restrictions, backups, retention, Auth abuse limits and organization access. Use HTTPS only. A successful source push or CI run is not evidence of a completed live deployment; verify the Vercel deployment URL and hosted acceptance workflow separately.

The web manifest and service worker support installation where the browser supports the supplied manifest. The worker deliberately caches no authenticated pages or financial responses. There is **no offline checkout**. Raster PNG icons are generated in 192/512 px sizes. Test installation on your exact iPad/Android/browser versions before rollout.

## Backup and recovery

Enable Supabase automatic backups/PITR appropriate to your plan. Use the Supabase CLI's documented `db dump` commands with credentials supplied securely by your operator; do not put connection strings in scripts or Git. Back up database schema/data/roles as supported by your plan, Auth identities and Storage objects using their documented export paths. Database backups alone do not include product image object bytes.

Test recovery into an isolated project: restore schema/data and associated Auth users, restore Storage images, configure new project variables, verify staff mappings/RLS, compare sales/refund/payment/stock totals, and print a known receipt. Document the recovery point/time and restrict access to exports containing personal information. Never test restoration over your live production project. CSV/XLSX reports are not complete backups.

## Repository structure

```text
src/app/shop.tsx            Public collection and checkout
src/app/admin/             Staff POS entry point
src/app/order/             Private customer order/status and receipt pages
src/app/retail.tsx          Responsive staff workspace and cashier interface
src/app/globals.css         Cream/espresso theme, dark mode, responsive/print layouts
src/app/api/auth/           Supabase password sign-in and sign-out
src/app/api/action/         Validated authenticated mutations → PostgreSQL RPCs
src/app/api/data/           Role-filtered data via RLS
src/app/api/export/         Owner-only Excel workbook export
src/lib/                   Supabase client, data loading, Zod and money helpers
src/proxy.ts               Supabase session-cookie refresh
supabase/migrations/       Ordered SQL schema, functions, policies, seed
public/                    Manifest, icon and non-caching service worker
tests/                     Monetary/schema tests and PostgreSQL integration tests
tests/browser/             Playwright responsive/HTTP smoke checks
docs/                      Security notes and deployment checklist
```

## Remaining production validation and limits

This release is **not certified production-ready**. No Supabase project URL/key was supplied, so hosted login, migrations, Storage uploads and an authenticated deployed checkout have not been exercised. Run `docs/CHECKLIST.md` before processing real money. PostgreSQL row locks are implemented and transaction tests pass; high-contention multi-connection checkout/load tests must still run against a real PostgreSQL/Supabase staging instance (PGlite serializes its connection).

The workspace fetches authorized records in pages and polls every 30 seconds. For large stores, move report aggregation/pagination into dedicated server queries and add load testing before scale-up. Stock is per branch; multi-branch tables and foreign keys are prepared, but no branch-switching/provisioning UI is included. Customer membership/loyalty fields are stored, with no automatic points accrual/redemption rules. Bundles and automatic bank/payment integrations are not implemented. LHDN/MyInvois integration is not implemented and no LHDN compliance is claimed. Camera scanning, silent thermal-printer drivers, email/SMS marketing and scheduled backup automation are outside this release. Hardware and mobile PWA installation need device verification.
