# Security and accounting contract

## Trust boundaries

- The browser supplies product IDs, quantities, requested discounts and recorded tender details. It cannot set prices, cost snapshots, stock balances, tax rates, cashier identity, receipt numbers or authoritative totals.
- `/api/action` authenticates with Supabase, rejects foreign origins and validates input with Zod. PostgreSQL functions independently enforce role/active membership, branch, quantity, discount, stock, payment and workflow constraints. All write tables deny direct writes by authenticated users; function execution is explicitly granted.
- Supabase RLS filters all read access. Anonymous accounts have no app read/write rights. No public signup/profile creation trigger grants roles. Initial owner provisioning requires database administration. Owners cannot alter themselves through staff management.
- Product costs and historical sale costs have separate owner-readable tables. Managers may see purchase order line costs as part of purchasing. Cashier API payloads never include either cost table or purchase orders.
- Do not expose service-role keys: they bypass RLS. The app uses the user's session with the public project key. Cookie refresh runs in the Next.js proxy; authorization uses `auth.getUser`, not a client-only session assertion.
- Authenticated customer access is deliberately available to cashiers for customer attachment and search, including contact details/notes. Restrict sensitive notes operationally. Sales history is limited to their own sales, so cashier lifetime-spending views reflect their visible transactions only. Staff may not send marketing without explicit opt-in; default consent is false.

## Transactions

Checkout locks the open cashier session, locks inventory sorted by product UUID, holds product row share locks, validates current prices/discounts, and inserts sale/items/costs/payments/movements in one transaction. Inventory check constraints prevent negative balances. A transaction-scoped advisory lock plus unique idempotency UUID prevents duplicate completion; retry responses are scoped to the original cashier. Database sequence receipt numbers use Malaysia transaction date with a monotonic global sequence. They are not per-day counters and may contain gaps.

Refunds lock the original sale and validate cumulative refunded quantities. Refund amounts allocate the original discounted/taxed total across item lines by cumulative integer proportions, then quantities by the same method. This guarantees a fully refunded sale returns the exact original total, including rounding residue. Refund tax is allocated similarly. Restock is opt-in. Voids invoke these refund operations inside one encompassing transaction and keep an immutable compensating record.

Closing locks the cashier session also used by checkout, preventing transactions from posting after closing. Cash refunds and cash movements lock their target session. A different manager must approve a submitted closing. No write functions modify approved records. Audit records are append-only from user roles and contain relevant change payloads. Database administrators remain privileged; operational controls and backups must protect that boundary.

## Reports

Stored money uses `bigint` integer sen, bounded at entry; percentages use integer basis points. Percent tax/discount calculations round half-up. Proportional refunds use cumulative floor allocation to conserve totals. Client-side formatting may divide by 100 for display; it is never authoritative. Negative totals and over-discounting are rejected in PostgreSQL. Tax is zero until the owner configures it; the application does not decide whether the business must register for SST.

Net revenue = completed sale totals − sale tax − refund totals + reversed refund tax, using each event's Malaysian date. COGS = original historical sale costs less costs of sellable restocked returned units. Non-restocked/damaged return costs remain in COGS. Gross profit excludes operating expenses. Product/category breakdowns display item-level revenue before order-level adjustments; labels distinguish these from net headline figures. Cash reconciliation uses recorded manual money movements and does not verify a bank balance.

## Deployment checks

Use a separate staging project, TLS, strong staff passwords, platform authentication abuse limits, least-privilege administrator access and MFA for privileged users. Before production, run real concurrent checkout/stock/refund/session tests, test RLS through REST as each role, verify hosted cookies/session refresh, inspect payment and tax behavior, restore a backup, and print receipts on actual hardware. No payment-provider verification, LHDN compliance, penetration-test certification or disaster-recovery SLA is claimed.
