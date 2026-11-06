# Official CHIPSTI branding and private DuitNow proofs

This release is prepared locally. Production migration and deployment require the owner's explicit approval. It extends the existing Next.js/Supabase shop and staff POS; it does not replace the catalogue, pricing, delivery promotion, customers, inventory, sales, or existing cash/bank methods.

## Supplied originals

The owner supplied `codexxx.zip`, containing exactly two JPEG files, visually inspected before use:

| Original filename                                  | Role                                                           | Preserved public copy                     |
| -------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `WhatsApp Image 2026-11-06 at 6.53.12 PM (1).jpeg` | Official koala-and-chip logo, 1080 × 1080                      | `/branding/chipsti-logo.original.jpeg`    |
| `WhatsApp Image 2026-11-06 at 7.40.19 PM.jpeg`     | Official CHIPSTI ENTERPRISE DuitNow/Touch 'n Go QR, 760 × 1080 | `/branding/chipsti-duitnow.original.jpeg` |

Both originals are byte-identical copies; `public/branding/source-files.json` records their SHA-256 hashes. The QR is never cropped, re-encoded, redrawn, generated, or sent through Next.js image optimization. Its displayed aspect ratio stays 760:1080. Customers can open the original or download it for their payment app's gallery scanner.

The logo's optimized WebP is deterministically resized from the original. Favicon (32 px), Apple touch (180 px) and PWA icons (192/512 px) use a crop containing the original mascot; no artwork was regenerated. The social image centers the original logo on a cream background. Existing generated C-monogram routes were replaced by static PNGs; the old standalone C SVG was removed. Shared `BrandLogo` appears in storefront/order headers, mobile headers, footer, checkout, staff sidebar/login, and both existing printable receipt views. The app has no separate invoice-generation module; existing receipt printing/PDF flows carry the new logo.

## Customer QR checkout

The catalogue adds **Touch 'n Go / DuitNow QR**, preserving cash on pickup and bank transfer. Before displaying the payable QR, the server independently quotes current prices, stock availability, tax and the existing postcode/free-delivery rules. The amount must match the basket estimate. Final order placement recalculates and validates everything again in its existing transaction.

The customer pays the exact amount through their own payment app, saves the successful receipt, uploads it, and submits the order. A QR order cannot be created without a validated, unexpired, unclaimed proof for that order amount. Changing basket quantities or delivery details invalidates the UI's prior proof selection. The quote is read-only, not a stock reservation; stock is reserved for 24 hours after successful order submission. A price/stock change between paying and submitting requires staff to reconcile the payment and arrange an appropriate order or refund. Customers should not pay again merely because a network retry fails.

A submitted QR order uses existing internal status `payment_submitted`, displayed as **Pending Verification**. It creates no paid sale/revenue until an active, authorized owner/manager explicitly checks the real merchant account and confirms payment. The existing open-cashier-session, verification checkbox, verified reference, sale/stock/audit/receipt and refund rules remain in force. A screenshot or PDF is evidence to review, not automatic settlement. No gateway webhook, automatic bank verification or real payment test is claimed.

## Private uploads and authorization

- `payment-proofs` is a **private** Supabase Storage bucket, limited to 5 MiB and JPEG/PNG/PDF. A restrictive Storage policy prevents anonymous/authenticated reads and writes to this bucket even if an unrelated permissive policy exists for other buckets. Public product-image access remains unchanged.
- The server prepares a random object path and returns a short-lived, object-scoped **write-only signed upload URL**. No privileged Supabase key enters the browser. File bytes upload directly to Storage, avoiding Vercel's buffered request-body limit.
- The client checks extension/MIME, file signature and size. The server then downloads the private object and independently checks exact length, signature and SHA-256 before marking the proof file ready. File signatures are validation, not an antivirus or OCR service. Failed validation invalidates the staged proof and removes the invalid object.
- `payment_proofs` metadata has RLS enabled and no anonymous/authenticated table grants. Its private claim token is never returned by the order-status API. Preparing/completing uploads uses service-role-only RPCs behind same-origin validation and durable rate limits. Upload and quote requests use separate hashed-IP rate buckets; the original checkout limits remain in force.
- Prepared proofs expire after 24 hours if unclaimed. A submitted order links its proof atomically. One proof cannot be claimed by multiple orders, and identical receipt bytes cannot be bound to a second order. Order and upload idempotency keys support ordinary retries without duplicate sales/orders.
- Proof availability is shown to staff, with **Download private payment proof** in order review. The download endpoint validates the staff session and an active owner/manager role in the same branch before using server credentials. It streams an attachment with no-store/no-referrer/nosniff headers. Customer PDFs are never embedded as executable website content, and no public/signed-read proof URL is issued.
- Existing pending QR orders can upload a proof through their private status page; bank reference submission is preserved. Paid historical orders are not rewritten. Operators must define their receipt-retention policy and include private Storage files/metadata in backups. Expired unclaimed objects should be cleaned up through an authorized maintenance process; this release does not silently delete retained business records.

## Required setup and release order

1. Obtain explicit owner approval before any production migration or deployment.
2. Apply `supabase/migrations/007_payment_proofs.sql` **once**, only to `chipsti-pos` (`xmbusapgcxtmdjvnbdgs`) after migration 006. Do not rerun 001–006 or use the original fruit-ordering database. The transaction guards the CHIPSTI identity, creates the private bucket/table, adds an order proof flag, and extends pricing/order/verification RPCs. It refuses an existing bucket with incompatible privacy/type/size settings.
3. Deploy the complete application and branding assets immediately after migration. The new proof requirement intentionally rejects old QR forms that do not upload a receipt; cash and bank workflows remain supported. Do not promote the QR method until the new deployment is Ready. Avoid leaving customers on old QR checkout during this transition.
4. No new environment variables or packages are required. Keep the existing public Supabase URL/publishable key and server-only service-role/secret key for the same CHIPSTI project. Management tokens belong only in the secure deployment environment, never `NEXT_PUBLIC_` variables or Git.
5. The supplied QR is enabled by this release's catalogue function. The admin settings show its fixed official URL rather than allowing a different image to replace it. Existing stored bank/payment settings and historical order instructions are not overwritten by the migration.
6. Verify hosted uploads and owner downloads with JPG, PNG, PDF and a 5 MiB file; reject invalid content/oversized files. Verify unauthorized/cross-branch downloads, proof reuse, stock changes, both fulfillment methods, RM300 configured-Klang-Valley shipping, pending status, manual confirmation, printing and refunds. Check actual iPad/Safari and mobile QR saving/gallery scanning. Make a real merchant payment only with separate authorization; record its reconciliation rather than claiming an automatic result.

## Main modified files

- Branding/assets: `public/branding/*`, favicon/Apple/PWA PNGs, `src/components/brand-logo.tsx`, `src/app/layout.tsx`, shared styles; removal of old generated C icon routes and helper.
- Checkout/status/POS: `src/app/shop.tsx`, `src/app/order/[token]/status.tsx`, `src/app/retail.tsx` and their styles.
- Receipt validation/upload UI: `src/lib/payment-proof.ts`, `payment-proof-validation.ts`, `brand.ts`, `shop-types.ts`, `shop-validation.ts`, `src/components/payment-proof-upload.tsx`.
- APIs: `/api/shop/quote`, `/api/shop/proof/prepare`, `/api/shop/proof/complete`, `/api/online-orders/proof`, and the existing `/api/shop/payment` route.
- Admin: `src/components/online-orders.tsx`, `src/proxy.ts`; existing owner/manager verification reused.
- Database: `supabase/migrations/007_payment_proofs.sql`.
- Tests/docs: payment-proof unit/database and QR browser suites, existing finance/delivery/shop/role suites, README and checklist.

Browser upload endpoints use isolated fixtures. SQL tests run PostgreSQL in PGlite with the migration; they do not establish hosted Storage behavior or prove a real bank payment. Originals, dimensions and QR byte hashes are checked automatically.

Local verification on 6 November 2026: 70 unit/database tests and 66 desktop/tablet/mobile Chromium browser tests passed. ESLint, TypeScript and the production build passed. This release, migration 007 and the private bucket have not been applied to production. No real merchant payment has been performed.
