# Product quantities and Klang Valley delivery

This release changes the existing public shop and owner settings. It does not add a payment provider, change product prices/stock, or alter historical sales. Do not apply a production migration or deploy without the owner's explicit release approval.

## Behavior

Every product card uses the existing basket state and shows a full-width minus / quantity / plus control. Quantities start at zero, cannot go negative, stop at available stock (and the existing 100-unit per-line checkout limit), remain selected when filtering, and remove a basket line at zero. Catalogue refreshes reconcile selections with current stock. PostgreSQL still checks inventory and pending reservations at order placement. The existing per-product ID is the basket key; this app has no separate product-variant model.

The catalogue banner advertises “FREE DELIVERY | Spend RM300 & above within Klang Valley”. Free delivery requires all of the following:

- Delivery fulfillment, not pickup.
- A complete delivery address and exact five-digit postcode.
- A postcode in an owner-configured area explicitly marked Klang Valley eligible.
- The postcode also passes the store's existing delivery postcode-prefix restrictions.
- Product subtotal after product discounts is at least 30,000 sen, excluding tax and delivery charges.

Unlisted postcodes never qualify by inference. A configured area uses its standard fee; an unlisted postcode uses the unchanged flat store fee if deliverable. Pickup is always RM0. Free delivery reduces the charge to zero; tax uses the resulting charged amount. The basket progress bar uses the product subtotal, caps at RM300, and does not promise free shipping before postcode and address are entered. Removing items or changing location/fulfillment immediately reprices the estimate.

Public online orders currently have no product discount-code interface. That remains unchanged. The shared estimate and private PostgreSQL pricing helper explicitly support a validated product-discount amount and are tested at the post-discount boundary. The current order-placement function passes zero product discounts because its products/prices come from the database; it rejects caller-supplied discounts, subtotals and shipping charges. A future online-discount feature must calculate its authorized discount on the server before calling the helper. Existing POS discounts are unaffected.

The postcode list is the owner's verified coverage configuration, not a geocoding service. A full address is required, but the app cannot independently confirm whether a street belongs to a supplied postcode; staff should review delivery details before dispatch.

## Migration and setup

1. Review `supabase/migrations/006_delivery_areas.sql`. With release approval, apply it **once**, before deploying the application, to **chipsti-pos** (`xmbusapgcxtmdjvnbdgs`) only. Migration 004 must already be installed; 005 is the independent product-name update. Do not rerun migrations 001–004 or apply this file to the original fruit database.
2. This transactional migration adds an empty JSON area list to existing shop settings and three order quote snapshot fields. It privately wraps existing catalogue/status/settings functions and updates server-side order pricing. It does not rewrite existing orders, product data, inventory, configured flat fees, payment settings or customers. New rows inherit the existing RLS protections. Private helper functions have no public/staff execution grants.
3. No new environment variables or packages are required. Existing public Supabase variables and the server-only order API key remain in use. No Vercel token belongs in the website's public configuration.
4. Deploy only after the migration has succeeded. Do not enable the banner release against the old pricing function; it cannot grant the new promotion. Existing catalogue data with no areas falls back to standard charges and never assumes free coverage.
5. Sign in as owner at `/admin`, open **Online Orders → Online shop settings**, and add delivery areas. Supply a name, exact comma-separated five-digit postcodes, standard fee in RM, and mark free-delivery eligibility only for verified Klang Valley coverage. Areas can be added, edited or removed. Each postcode belongs to at most one area; broad prefixes such as `50` are rejected in these lists. Up to 20 areas with 100 postcodes each are supported, subject to the existing request size limit. The general postcode-prefix restriction still controls which addresses can be delivered to at all.
6. Keep the standard flat fee for unlisted but deliverable locations. With no configured eligible areas, no customer automatically receives free delivery. Do not populate guessed postcode coverage.

New orders snapshot the standard charge, waived amount and area label along with the existing final quote. Status, receipts and staff order review show the charged delivery amount and an explicitly informational saving already included in that amount. Existing orders continue showing their original fees even if configuration changes. Paid sales and refunds record the actual shipping charge, never the waived fee as revenue or a refund.

## Verification

PostgreSQL and unit tests cover RM299.99/RM300/RM350, exact postcode matching, unconfigured areas, area-specific/fallback charges, pickup, post-discount thresholds, tax, forged totals/discounts, missing addresses, existing-order preservation, settings-role restrictions, private helpers, and paid-sale/refund accounting. The existing POS/payment/reservation/refund tests also run with migration 006 installed.

Browser tests use isolated API fixtures and cover quantities, stock caps, zero removal, filters, basket synchronization, admin area creation/removal, progress/location changes, checkout totals, and existing order/reference flows in desktop, tablet and mobile Chromium viewports. They do not create production orders or establish Safari/iPad hardware compatibility. Before launch, test the actual hosted owner settings and a pickup/delivery order with the intended coverage/charges, and verify a paid receipt/refund and physical-device layout. No automatic courier booking or payment verification is introduced.

Local verification on 6 November 2026: 56 unit/database tests and 45 browser tests passed, along with ESLint, TypeScript and the production build. Migration 006 has not been applied to production, and this release has not been pushed or deployed.
