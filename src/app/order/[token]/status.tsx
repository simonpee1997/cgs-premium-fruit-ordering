"use client";
import ReceiptPdfActions from "@/components/receipt-pdf-actions";
import {
  BankAccountDetails,
  ReceiptPaymentDetails,
} from "@/components/receipt-payment-details";
import PaymentProofUpload from "@/components/payment-proof-upload";
import type { UploadedProof } from "@/lib/payment-proof";
import { OFFICIAL_DUITNOW_QR } from "@/lib/brand";
import BrandLogo from "@/components/brand-logo";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { orderWhatsApp } from "@/lib/order-whatsapp";
import { customerDeliveryNote } from "@/lib/customer-delivery-note";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Clock,
  Printer,
  RefreshCw,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { money, localDate } from "@/lib/money";
import { orderItemEnglishName } from "@/lib/order-item-name";
import type { PublicOrder } from "@/lib/shop-types";
import "../../shop.css";
const labels: Record<string, string> = {
  awaiting_payment: "Order received",
  payment_submitted: "Payment reference received",
  paid: "Payment confirmed",
  ready: "Ready for collection",
  dispatched: "On its way",
  completed: "Order completed",
  refunded: "Order refunded",
  cancelled: "Order cancelled",
  expired: "Reservation expired",
};
export default function OrderStatus({ token }: { token: string }) {
  const receiptRef = useRef<HTMLElement>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [proof, setProof] = useState<UploadedProof | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/shop/status?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOrder(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load order");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0),
      refresh = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(start);
      clearInterval(refresh);
    };
  }, [load]);
  const pending =
      order && ["awaiting_payment", "payment_submitted"].includes(order.status),
    paid =
      order &&
      ["paid", "ready", "dispatched", "completed", "refunded"].includes(
        order.status,
      );
  const whatsapp = order ? orderWhatsApp(order, token) : null;
  useEffect(() => {
    if (!order || window.location.hash !== "#whatsapp") return;
    // Consume the checkout-only handoff before leaving, so Back/refresh/polling
    // opens the saved receipt normally rather than starting a redirect loop.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    if (whatsapp?.url) window.location.assign(whatsapp.url);
  }, [order, whatsapp?.url]);
  return (
    <div className="shop shop-order-page">
      <header className="shop-header">
        <Link className="shop-brand" href="/">
          <BrandLogo priority />
          <span>
            CHIPSTI<small>ENTERPRISE</small>
          </span>
        </Link>
        <Link className="shop-return" href="/">
          Back to collection
          <ArrowRight size={16} />
        </Link>
      </header>
      <main className="shop-order-wrap">
        {loading ? (
          <div className="shop-loading">Loading your order…</div>
        ) : !order ? (
          <section className="shop-order-panel">
            <h1>We couldn’t open this order.</h1>
            <p>{error}</p>
            <button className="shop-secondary" onClick={() => void load()}>
              Try again
              <RefreshCw size={16} />
            </button>
          </section>
        ) : (
          <>
            <section className="shop-order-panel">
              <div className="shop-order-icon">
                {paid ? <Check size={28} /> : <Clock size={28} />}
              </div>
              <span className="shop-eyebrow">{order.order_number}</span>
              <h1>
                {order.payment_method === "duitnow" &&
                order.status === "payment_submitted"
                  ? "Pending Verification"
                  : (labels[order.status] ?? order.status)}
              </h1>
              <p>
                {pending
                  ? order.payment_method === "duitnow" &&
                    order.payment_proof_received
                    ? "Thank you for ordering from CHIPSTI! Your order has been received. We will verify your payment and confirm your order shortly."
                    : "Thank you for your order. Payment has not yet been confirmed."
                  : order.status === "refunded"
                    ? "Your order has been fully refunded. The original payment and refund totals are shown below."
                    : paid
                      ? "Thank you for shopping with CHIPSTI. Your payment was manually confirmed by our team."
                      : order.cancellation_reason ||
                        "Please contact our team before sending any payment."}
              </p>
              {pending && (
                <p className="shop-order-deadline">
                  Reservation valid until {localDate(order.expires_at)}. Contact
                  the store if you have already paid and the reservation
                  expires.
                </p>
              )}
              <button className="shop-secondary" onClick={() => void load()}>
                <RefreshCw size={16} />
                Refresh status
              </button>
              {whatsapp?.url && (
                <a
                  className="shop-primary shop-order-whatsapp"
                  href={whatsapp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={18} />
                  <span>Send order to WhatsApp / WhatsApp 发送订单</span>
                </a>
              )}
            </section>
            {pending && order.payment_method !== "cash" && (
              <section className="shop-order-panel">
                <h2>Payment instructions</h2>
                <div className="shop-payment-due">{money(order.total_sen)}</div>
                {order.payment_method === "bank" ? (
                  <div className="shop-bank">
                    <BankAccountDetails bank={order.store} />
                  </div>
                ) : (
                  <>
                    <h3>Pay CHIPSTI ENTERPRISE</h3>
                    <p>
                      Amount to pay: <strong>{money(order.total_sen)}</strong>
                    </p>
                    <Image
                      className="shop-qr"
                      src={OFFICIAL_DUITNOW_QR}
                      alt="Store DuitNow payment QR"
                      width={760}
                      height={1080}
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                    <div className="shop-qr-links">
                      <a
                        href={OFFICIAL_DUITNOW_QR}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View original QR
                      </a>
                      <a
                        href={OFFICIAL_DUITNOW_QR}
                        download="CHIPSTI-ENTERPRISE-DuitNow-QR.jpeg"
                      >
                        Save QR image
                      </a>
                    </div>
                  </>
                )}
                <p>
                  Use <strong>{order.order_number}</strong> as the transfer
                  note. Check the recipient’s name and amount in your bank app
                  before paying.
                </p>
                {order.payment_reference &&
                (order.payment_method !== "duitnow" ||
                  order.payment_proof_received) ? (
                  <div className="shop-order-notice">
                    <Check size={18} />
                    Reference submitted: {order.payment_reference}. Our team
                    will check the payment.
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        order.payment_method === "duitnow" &&
                        !proof &&
                        !order.payment_proof_received
                      ) {
                        setError("Upload payment proof before submitting.");
                        return;
                      }
                      const form = new FormData(e.currentTarget);
                      setBusy(true);
                      setError("");
                      try {
                        const response = await fetch("/api/shop/payment", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            token,
                            reference: form.get("reference"),
                            ...(proof
                              ? { proof_id: proof.id, proof_token: proof.token }
                              : {}),
                          }),
                        });
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error);
                        setNotice(
                          "Reference received. Our team will verify payment.",
                        );
                        await load();
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Submission failed",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {order.payment_method === "duitnow" &&
                      !order.payment_proof_received && (
                        <PaymentProofUpload
                          totalSen={order.total_sen}
                          disabled={busy}
                          onUploaded={setProof}
                        />
                      )}
                    <label>
                      Bank or DuitNow transaction reference
                      <input
                        name="reference"
                        defaultValue={order.payment_reference ?? ""}
                        minLength={3}
                        maxLength={150}
                        required
                      />
                    </label>
                    <button
                      className="shop-primary"
                      disabled={
                        busy ||
                        (order.payment_method === "duitnow" &&
                          !order.payment_proof_received &&
                          !proof)
                      }
                    >
                      {busy ? "Submitting…" : "I have made payment"}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
              </section>
            )}
            <section
              className="shop-order-panel shop-customer-receipt"
              ref={receiptRef}
            >
              <div className="shop-receipt-identity">
                <BrandLogo className="receipt-logo" />
                <h2>CHIPSTI ENTERPRISE</h2>
                <p>SSM: 202603232290 (RA0139100-V)</p>
                <strong>{order.receipt_number || order.order_number}</strong>
                <p>
                  {paid && order.confirmed_at
                    ? localDate(order.confirmed_at)
                    : localDate(order.created_at)}
                </p>
                {paid && order.cashier_name && (
                  <p>Cashier / 收银员: {order.cashier_name}</p>
                )}
                <p>
                  {paid
                    ? "Payment receipt / 付款收据"
                    : "Order summary · not a payment receipt / 订单摘要 · 非付款收据"}
                </p>
              </div>
              <hr />
              {order.items.map((i) => {
                const englishName = orderItemEnglishName(i);
                return (
                  <div className="shop-receipt-line" key={i.sku}>
                    <div>
                      <strong lang={englishName ? "en" : undefined}>
                        {englishName || i.name}
                      </strong>
                      {englishName && englishName !== i.name && (
                        <small lang="zh">{i.name}</small>
                      )}
                      <small>
                        {i.sku} · {i.quantity} × {money(i.unit_price_sen)}
                      </small>
                      {(i.refunded_quantity ?? 0) > 0 && (
                        <small>
                          Refunded quantity / 已退款数量: {i.refunded_quantity}
                        </small>
                      )}
                    </div>
                    <span>{money(i.total_sen)}</span>
                  </div>
                );
              })}
              <div className="shop-totals">
                <div>
                  <span>Products / 商品小计</span>
                  <strong>{money(order.subtotal_sen)}</strong>
                </div>
                <div>
                  <span>Delivery / 配送费</span>
                  <strong>{money(order.delivery_fee_sen)}</strong>
                </div>
                {(order.delivery_discount_sen ?? 0) > 0 && (
                  <div>
                    <span>
                      Free delivery saving (included above) /
                      免运费优惠（已扣除）
                    </span>
                    <strong>−{money(order.delivery_discount_sen ?? 0)}</strong>
                  </div>
                )}
                <div>
                  <span>Tax / 税费</span>
                  <strong>{money(order.tax_sen)}</strong>
                </div>
                {order.payment_method === "duitnow" && (
                  <div>
                    <span>Payment status / 付款状态</span>
                    <strong>
                      {paid
                        ? "Paid / 已付款"
                        : pending
                          ? "Pending Verification / 待核实"
                          : labels[order.status]}
                    </strong>
                  </div>
                )}
                <div className="shop-grand-total">
                  <span>Total / 总计</span>
                  <strong>{money(order.total_sen)}</strong>
                </div>
                <div>
                  <span>
                    {paid ? "Amount paid / 已付金额" : "Amount due / 应付金额"}
                  </span>
                  <strong>{money(order.total_sen)}</strong>
                </div>
                {paid && (
                  <>
                    <div>
                      <span>Amount received / 实收金额</span>
                      <strong>
                        {money(order.tendered_sen ?? order.total_sen)}
                      </strong>
                    </div>
                    <div>
                      <span>Change / 找零</span>
                      <strong>{money(order.change_sen ?? 0)}</strong>
                    </div>
                  </>
                )}
                {order.refunded_sen > 0 && (
                  <div>
                    <span>Refunded / 已退款</span>
                    <strong>{money(order.refunded_sen)}</strong>
                  </div>
                )}
              </div>
              <p>
                Payment method / 付款方式:{" "}
                {order.payment_method === "cash"
                  ? "Cash on collection / 取货时付款"
                  : order.payment_method === "bank"
                    ? "Bank transfer / 银行转账"
                    : "Touch ’n Go / DuitNow QR / 扫码付款"}
                <br />
                {paid
                  ? "Cashier-confirmed payment / 收银员已确认付款"
                  : "Payment verification pending / 付款待核实"}
              </p>
              <ReceiptPaymentDetails bank={order.store} />
              <ReceiptPdfActions
                key={JSON.stringify(order)}
                getReceipt={() => receiptRef.current}
                name={order.receipt_number || order.order_number}
                layout="customer"
                whatsappUrl={whatsapp?.url}
                shareText={whatsapp?.summary}
              />
              <div className="shop-receipt-actions" data-pdf-exclude>
                <button
                  className="shop-secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  {paid
                    ? "Print receipt / save PDF / 打印收据或保存 PDF"
                    : "Print order summary / 打印订单摘要"}
                </button>
              </div>
            </section>
            <section className="shop-order-panel">
              <h2>
                {order.fulfillment === "pickup"
                  ? "Collection details"
                  : "Delivery details"}
              </h2>
              <p>
                <strong>{order.customer_name}</strong>
                <br />
                {order.fulfillment === "pickup"
                  ? order.store.pickup_address
                  : `${order.address} · ${order.postcode}`}
              </p>
              {order.fulfillment === "delivery" &&
                customerDeliveryNote(order.store.delivery_note) && (
                  <p>{customerDeliveryNote(order.store.delivery_note)}</p>
                )}
              {order.store.contact_phone && (
                <p>Contact our team: {order.store.contact_phone}</p>
              )}
            </section>
            {notice && (
              <p className="shop-order-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="shop-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </main>
      <footer className="shop-footer">
        <span>CHIPSTI ENTERPRISE · SSM 202603232290 (RA0139100-V)</span>
        <Link href="/">
          <ShoppingBag size={15} />
          Continue shopping
        </Link>
      </footer>
    </div>
  );
}
