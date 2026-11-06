# Phase 3 — compact product-first storefront

The homepage starts with the official koala-and-chip logo, Products/About/Contact navigation and cart count, followed by the compact free-delivery banner, search/category filters and catalogue. The oversized hero and decorative introduction were removed. Brand storytelling is now on `/about`; pickup, delivery, phone and registration details remain available.

The grid adapts from six columns on screens at least 1800px wide to four/three columns, then two on mobile. The desktop order summary stays beside the grid. Tablets and phones use the sticky item-count/total bar and shared cart sheet. Quantity buttons have 44px touch targets; English product names appear first with Chinese names below. Product assets, prices and availability still come from the existing catalogue.

The Playwright screenshot artifacts are `test-results/product-first-desktop.png`, `product-first-tablet.png` and `product-first-mobile.png` (synthetic fixtures). They show the first product row without scrolling and no horizontal overflow. No fruit branding, merchant details or fees were copied.
