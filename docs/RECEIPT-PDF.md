# Receipt PDF downloads

Both the POS receipt modal and the customer's order receipt include **Download PDF / 下载 PDF**. The existing receipt content, bilingual names, MYR totals, payment state and print controls are retained. The saved PDF adds the supplied, unchanged DuitNow QR and the saved bank name, account name and account number when configured.

PDFs are generated locally in the browser. No customer information is sent to a PDF provider or stored on a new server. The export libraries load only when requested. Chinese text and the current receipt appearance are rendered into the PDF without relying on external font downloads. Export controls are excluded; long receipts split between receipt blocks. The selected POS paper width is retained on A4 pages.

After download, browsers supporting native file sharing show **Share PDF / 分享 PDF**. Other browsers can attach the downloaded file to WhatsApp, email or another app. Sharing requires a separate user click to retain mobile browser activation.

Online receipts use the payment details already saved in the order's store snapshot. POS receipts read current saved payment settings through `/api/receipt-payment?sale_id=...`. That read-only route validates the staff session, active owner/manager/cashier profile, sale visibility under RLS and matching branch before a server-only client reads just three customer-facing bank fields. Anonymous, inactive and unrelated-branch access is rejected. Existing RLS and database records are unchanged. Failed payment-detail/image loading prevents an incomplete export and offers a retry.

Validation includes access-control unit tests, actual downloaded PDFs on desktop/tablet/mobile, native-share simulation, multi-page receipts, and POS receipt exports. Rendered customer and POS PDF QR codes were decoded and matched byte-for-byte against the supplied merchant QR payload. Browser tests use synthetic receipts and create no production orders or payments.

Deploy the application through the existing GitHub main/Vercel integration. No SQL migrations or new environment variables are required. Rollback uses the previous Vercel deployment; no database rollback is necessary.
