# Receipt PDF downloads

Both the POS receipt modal and the customer's order receipt include **Download PDF / 下载 PDF**. The existing receipt content, bilingual names, MYR totals, payment state and print controls are retained. The saved PDF adds the supplied, unchanged DuitNow QR and the saved bank name, account name and account number when configured.

PDFs are generated locally in the browser. No customer information is sent to a PDF provider or stored on a new server. The export libraries load only when requested. Chinese text and the current receipt appearance are rendered into the PDF without relying on external font downloads. Export controls are excluded; long receipts split between receipt blocks. The selected POS paper width is retained on A4 pages.

After download, browsers supporting native file sharing show **Share PDF / 分享 PDF**. Other browsers can attach the downloaded file to WhatsApp, email or another app. Sharing requires a separate user click to retain mobile browser activation.

Online receipts use the payment details already saved in the order's store snapshot. POS receipts read current saved payment settings through `/api/receipt-payment?sale_id=...`. That read-only route validates the staff session, active owner/manager/cashier profile, sale visibility under RLS and matching branch before a server-only client reads just three customer-facing bank fields. Anonymous, inactive and unrelated-branch access is rejected. Existing RLS and database records are unchanged. Failed payment-detail/image loading prevents an incomplete export and offers a retry.

Validation includes access-control unit tests, actual downloaded PDFs on desktop/tablet/mobile, native-share simulation, multi-page receipts, and POS receipt exports. Rendered customer and POS PDF QR codes were decoded and matched byte-for-byte against the supplied merchant QR payload. Browser tests use synthetic receipts and create no production orders or payments.

Deploy the application through the existing GitHub main/Vercel integration. No SQL migrations or new environment variables are required. Rollback uses the previous Vercel deployment; no database rollback is necessary.

## Maybank correction

CHIPSTI's approved Maybank account is stored as `512222906185`, with holder `CHIPSTI ENTERPRISE`. Receipts display `5122 2290 6185`; the copy button copies raw digits and is excluded from PDF/print output. Settings validation strips whitespace before saving. Legacy snapshots for this exact account use the approved holder/name without rewriting order history; unrelated account snapshots retain their own details.

`scripts/correct-chipsti-bank.mjs` is a one-time, explicitly invoked configuration utility, skipped during normal builds. Its apply mode requires the exact approved production Git commit and the CHIPSTI Supabase origin. It verifies one settings branch, the business name and SSM, updates only the three bank fields with an optimistic concurrency check, and rereads them for verification. It never changes QR configuration, orders, payments, or schema. Protected production credentials stay inside the deployment environment and are never printed or retrieved by the application client.

The npm postbuild hook exits immediately unless `CHIPSTI_BANK_CORRECTION_SHA` is supplied to that deployment. Apply mode requires it to equal `VERCEL_GIT_COMMIT_SHA`; the flag is never saved as a project environment variable.

## Customer WhatsApp handoff

After a saved order loads, **Send order to WhatsApp / WhatsApp 发送订单** opens `wa.me` for the saved merchant contact number. The prefilled message contains the saved order number, bilingual items/quantities, subtotal, shipping, tax, total, fulfillment details and actual order status. The explicit store-chat action includes that order's private tracking link so the merchant can open it. No order or payment state changes when opening WhatsApp, and the customer must press Send in WhatsApp.

The receipt also offers **Open store WhatsApp** beside PDF controls. Customers can attach their downloaded PDF in that chat. On devices supporting file sharing, **Share PDF** opens the system share menu; customers select WhatsApp and the store recipient. Supported devices also receive the order summary text, without its private tracking link. A wa.me link cannot pre-attach a PDF or force a recipient in the OS file-share menu. No WhatsApp Business API credentials or automated messages are introduced.
