# Storefront compatibility release

This application-only release targets the existing database through migrations 001–007. It does not apply, include, or activate promotion-management migrations 008–009 or any campaign.

The public catalogue explicitly reports `promotions_available: false`. The storefront hides promotion entry, skips promotion quote requests, clears stale promotion state on catalogue refresh, and sends ordinary checkout/QR quote requests without promotion fields. Existing strict server schemas and database price/stock validation remain unchanged. Delivery, pickup, cash, bank transfer, private DuitNow proof upload and staff payment confirmation retain their existing endpoints.

The storefront uses English product names first, Chinese secondary names, a compact product-first layout, desktop cart and mobile basket. The About page is linked from the header.

Validation: lint, TypeScript, 70 unit/database tests, production build, and responsive browser tests including checkout without promotion capabilities. Browser checkout uses fixtures; production verification must not create test orders, receipts or payment proofs.

Deployment: publish this application commit to the linked GitHub main branch; Vercel builds the application using existing configured credentials. No migration command is part of deployment. Verify the exact deployed commit and chipsti.com catalogue, cart, admin sign-in and payment quote. Roll back the Vercel production alias to the preceding ready deployment if necessary; no database rollback is needed.

Promotion-management work remains separate and must pass the outstanding production schema metadata review before installation or campaign activation.
