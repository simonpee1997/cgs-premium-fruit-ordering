"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Clock,
  Printer,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { money, localDate } from "@/lib/money";
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
  const [order, setOrder] = useState<PublicOrder | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
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
  return (
    <div className="shop shop-order-page">
      <header className="shop-header">
        <Link className="shop-brand" href="/">
          <span className="shop-monogram">C</span>
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
              <h1>{labels[order.status] ?? order.status}</h1>
              <p>
                {pending
                  ? "Thank you for your order. Payment has not yet been confirmed."
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
              <p className="shop-order-private">
                Save this private order link. Anyone with this link can view
                your order; share it only with people you trust.
              </p>
              <button className="shop-secondary" onClick={() => void load()}>
                <RefreshCw size={16} />
                Refresh status
              </button>
            </section>
            {pending && order.payment_method !== "cash" && (
              <section className="shop-order-panel">
                <h2>Payment instructions</h2>
                <div className="shop-payment-due">{money(order.total_sen)}</div>
                {order.payment_method === "bank" ? (
                  <div className="shop-bank">
                    <p>
                      <strong>{order.store.bank_name}</strong>
                    </p>
                    <p>Account name: {order.store.bank_account_name}</p>
                    <p>
                      Account number:{" "}
                      <strong>{order.store.bank_account_number}</strong>
                    </p>
                  </div>
                ) : (
                  order.store.duitnow_qr_url && (
                    <Image
                      className="shop-qr"
                      src={order.store.duitnow_qr_url}
                      alt="Store DuitNow payment QR"
                      width={260}
                      height={260}
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  )
                )}
                <p>
                  Use <strong>{order.order_number}</strong> as the transfer
                  note. Check the recipient’s name and amount in your bank app
                  before paying.
                </p>
                {order.payment_reference ? (
                  <div className="shop-order-notice">
                    <Check size={18} />
                    Reference submitted: {order.payment_reference}. Our team
                    will check the payment.
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
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
                    <label>
                      Bank or DuitNow transaction reference
                      <input
                        name="reference"
                        minLength={3}
                        maxLength={150}
                        required
                      />
                    </label>
                    <button className="shop-primary" disabled={busy}>
                      {busy ? "Submitting…" : "I have made payment"}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
              </section>
            )}
            <section className="shop-order-panel shop-customer-receipt">
              <div className="shop-receipt-identity">
                <h2>CHIPSTI ENTERPRISE</h2>
                <p>SSM: 202603232290 (RA0139100-V)</p>
                <strong>{order.receipt_number || order.order_number}</strong>
                <p>
                  {paid && order.confirmed_at
                    ? localDate(order.confirmed_at)
                    : localDate(order.created_at)}
                </p>
                {paid && order.cashier_name && (
                  <p>Cashier: {order.cashier_name}</p>
                )}
                <p>
                  {paid
                    ? "Payment receipt"
                    : "Order summary · not a payment receipt"}
                </p>
              </div>
              <hr />
              {order.items.map((i) => (
                <div className="shop-receipt-line" key={i.sku}>
                  <div>
                    <strong>{i.name}</strong>
                    <small>
                      {i.sku} · {i.quantity} × {money(i.unit_price_sen)}
                    </small>
                    {(i.refunded_quantity ?? 0) > 0 && (
                      <small>Refunded quantity: {i.refunded_quantity}</small>
                    )}
                  </div>
                  <span>{money(i.total_sen)}</span>
                </div>
              ))}
              <div className="shop-totals">
                <div>
                  <span>Products</span>
                  <strong>{money(order.subtotal_sen)}</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>{money(order.delivery_fee_sen)}</strong>
                </div>
                <div>
                  <span>Tax</span>
                  <strong>{money(order.tax_sen)}</strong>
                </div>
                <div className="shop-grand-total">
                  <span>Total</span>
                  <strong>{money(order.total_sen)}</strong>
                </div>
                <div>
                  <span>{paid ? "Amount paid" : "Amount due"}</span>
                  <strong>{money(order.total_sen)}</strong>
                </div>
                {paid && (
                  <>
                    <div>
                      <span>Amount received</span>
                      <strong>
                        {money(order.tendered_sen ?? order.total_sen)}
                      </strong>
                    </div>
                    <div>
                      <span>Change</span>
                      <strong>{money(order.change_sen ?? 0)}</strong>
                    </div>
                  </>
                )}
                {order.refunded_sen > 0 && (
                  <div>
                    <span>Refunded</span>
                    <strong>{money(order.refunded_sen)}</strong>
                  </div>
                )}
              </div>
              <p>
                Payment method:{" "}
                {order.payment_method === "cash"
                  ? "Cash on collection"
                  : order.payment_method === "bank"
                    ? "Bank transfer"
                    : "DuitNow QR"}
                <br />
                {paid
                  ? "Cashier-confirmed payment"
                  : "Payment verification pending"}
              </p>
              <div className="shop-receipt-actions">
                <button
                  className="shop-secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  {paid ? "Print receipt / save PDF" : "Print order summary"}
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
              {order.fulfillment === "delivery" && (
                <p>{order.store.delivery_note}</p>
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
