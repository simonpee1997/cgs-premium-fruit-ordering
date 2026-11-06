"use client";
import { useState } from "react";
import { Check, Settings, RefreshCw, ShoppingBag } from "lucide-react";
import { money, parseAmount, localDate } from "@/lib/money";
import type { AppData } from "@/lib/data";
import { OFFICIAL_DUITNOW_QR_URL } from "@/lib/brand";
import type { DeliveryArea } from "@/lib/shop-types";
const defaults = {
  enabled: false,
  allow_pickup: true,
  allow_delivery: true,
  allow_cash_pickup: true,
  pickup_address: "",
  contact_phone: "",
  delivery_fee_sen: 0,
  delivery_postcode_prefixes: [] as string[],
  delivery_note: "",
  delivery_areas: [] as DeliveryArea[],
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  duitnow_qr_url: "",
};
export default function OnlineOrders({
  data,
  refresh,
}: {
  data: AppData;
  refresh: () => Promise<void>;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("pending"),
    [areaDraft, setAreaDraft] = useState<DeliveryArea[]>([]);
  const orders = data.tables.online_orders ?? [],
    items = data.tables.online_order_items ?? [],
    setting = {
      ...defaults,
      ...data.tables.online_store_settings?.[0],
    } as typeof defaults;
  const order = orders.find((o) => o.id === selected),
    lines = items.filter((i) => i.order_id === selected);
  const refundedAmount = (o: (typeof orders)[number]) =>
    (data.tables.refunds ?? [])
      .filter((r) => r.sale_id === o.sale_id)
      .reduce((sum, r) => sum + r.total_sen, 0);
  const isRefunded = (o: (typeof orders)[number]) =>
    Boolean(o.sale_id) && refundedAmount(o) >= o.total_sen;
  const expired = (o: (typeof orders)[number]) =>
    ["awaiting_payment", "payment_submitted"].includes(o.status) &&
    new Date(o.expires_at) <= new Date();
  const pending = (o: (typeof orders)[number]) =>
    ["awaiting_payment", "payment_submitted"].includes(o.status) && !expired(o);
  const visible = [...orders]
    .filter(
      (o) =>
        filter === "all" ||
        (filter === "pending"
          ? pending(o)
          : ["paid", "ready", "dispatched"].includes(o.status) &&
            !isRefunded(o)),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  async function mutate(payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/online-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setNotice("Online order updated");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="online-admin">
      <div className="toolbar">
        <p>
          {orders.filter(pending).length} pending orders · reservations last 24
          hours
        </p>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        {data.profile.role === "owner" && (
          <button
            className="primary"
            onClick={() => {
              setAreaDraft(
                setting.delivery_areas.map((area) => ({
                  ...area,
                  postcodes: [...area.postcodes],
                })),
              );
              setSettingsOpen(true);
              setError("");
            }}
          >
            <Settings size={16} />
            Online shop settings
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!setting.enabled && (
        <div className="panel">
          <h2>Online ordering is paused</h2>
          <p>
            Customers can browse the catalogue. Configure collection, delivery
            and payment details, enter your actual stock, then enable ordering.
          </p>
        </div>
      )}
      <div className="toolbar">
        <label>
          Show
          <select
            aria-label="Filter online orders"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="pending">Awaiting payment</option>
            <option value="active">Paid / in progress</option>
            <option value="all">All orders</option>
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Order",
                "Date",
                "Customer",
                "Method",
                "Total",
                "Status",
                "",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id}>
                <td>{o.order_number}</td>
                <td>{localDate(o.created_at)}</td>
                <td>{o.customer_name}</td>
                <td>{o.fulfillment}</td>
                <td>{money(o.total_sen)}</td>
                <td>
                  {isRefunded(o)
                    ? "refunded"
                    : expired(o)
                      ? "expired"
                      : o.status.replaceAll("_", " ")}
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(o.id);
                      setError("");
                    }}
                  >
                    Review order
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">
            <ShoppingBag />
            <h3>No matching online orders</h3>
            <p>
              Customer orders will appear here after they are placed in the
              shop.
            </p>
          </div>
        )}
      </div>
      {order && (
        <div className="overlay">
          <section
            className="modal online-order-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review online order"
          >
            <div className="modal-heading">
              <h2>{order.order_number}</h2>
              <button
                className="icon-btn"
                onClick={() => !busy && setSelected("")}
                aria-label="Close online order"
              >
                ×
              </button>
            </div>
            <p>
              <strong>{order.customer_name}</strong>
              <br />
              {order.phone}
              {order.email && (
                <>
                  <br />
                  {order.email}
                </>
              )}
              <br />
              {order.fulfillment === "pickup"
                ? "Store pickup"
                : `${order.address} · ${order.postcode}`}
            </p>
            {order.notes && <p>Customer note: {order.notes}</p>}
            <p>
              Status:{" "}
              {expired(order) ? "expired" : order.status.replaceAll("_", " ")}
              <br />
              Reserved until: {localDate(order.expires_at)}
            </p>
            {order.sale_id && refundedAmount(order) > 0 && (
              <p className="notice">
                Refunded: {money(refundedAmount(order))}. Check refunded
                quantities in Refunds before completing this order.
              </p>
            )}
            {lines.map((i) => {
              const line = (data.tables.sale_items ?? []).find(
                (s) =>
                  s.sale_id === order.sale_id && s.product_id === i.product_id,
              );
              const returned = line
                ? (data.tables.refund_items ?? [])
                    .filter((r) => r.sale_item_id === line.id)
                    .reduce((sum, r) => sum + r.quantity, 0)
                : 0;
              return (
                <div className="summary-row" key={i.id}>
                  <span>
                    {i.sku} · {i.english_name || i.name} × {i.quantity}
                    {i.english_name && (
                      <small style={{ display: "block" }} lang="zh">
                        {i.name}
                      </small>
                    )}
                    {returned > 0 && (
                      <small style={{ display: "block" }}>
                        Refunded: {returned} · Remaining to fulfill:{" "}
                        {i.quantity - returned}
                      </small>
                    )}
                  </span>
                  <strong>
                    {money(i.total_sen - (i.promotion_discount_sen ?? 0))}
                  </strong>
                </div>
              );
            })}
            {(order.promotion_discount_sen ?? 0) > 0 && (
              <div className="summary-row">
                <span>Promotion · {order.promo_code}</span>
                <strong>−{money(order.promotion_discount_sen)}</strong>
              </div>
            )}
            {order.payment_method === "duitnow" && (
              <div className="panel">
                <h3>
                  Touch ’n Go / DuitNow QR ·{" "}
                  {order.sale_id ? "Paid" : "Pending Verification"}
                </h3>
                {order.payment_proof_received ? (
                  <a
                    className="secondary"
                    href={`/api/online-orders/proof?order_id=${order.id}`}
                  >
                    Download private payment proof
                  </a>
                ) : (
                  <p>
                    No payment proof received yet. QR payment cannot be
                    confirmed until a receipt is uploaded.
                  </p>
                )}
                <p>
                  Check the merchant payment account before confirming. A
                  receipt is evidence to review, not automatic proof of
                  settlement.
                </p>
              </div>
            )}
            <div className="summary-row">
              <span>Delivery</span>
              <strong>{money(order.delivery_fee_sen)}</strong>
            </div>
            {Number(order.delivery_discount_sen) > 0 && (
              <div className="summary-row">
                <span>Free delivery saving (included above)</span>
                <strong>−{money(order.delivery_discount_sen)}</strong>
              </div>
            )}
            <div className="summary-row">
              <span>Tax</span>
              <strong>{money(order.tax_sen)}</strong>
            </div>
            <div className="total-row">
              <span>Total</span>
              <strong>{money(order.total_sen)}</strong>
            </div>
            <p>
              Payment method: {order.payment_method}
              <br />
              Customer reference: {order.payment_reference || "Not submitted"}
            </p>
            {pending(order) && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  try {
                    await mutate({
                      operation: "confirm_payment",
                      id: order.id,
                      verified: true,
                      reference: String(values.get("reference") || ""),
                      tendered_sen: parseAmount(String(values.get("tendered"))),
                    });
                  } catch {}
                }}
              >
                <p>
                  Open your cashier session first. Check your bank/provider
                  records before confirming a transfer. This action creates the
                  sale, deducts inventory and issues a receipt.
                </p>
                {order.payment_method !== "cash" && (
                  <label>
                    Verified bank / payment reference
                    <input
                      name="reference"
                      defaultValue={order.payment_reference ?? ""}
                      minLength={3}
                      maxLength={150}
                      required
                    />
                  </label>
                )}
                <label>
                  {order.payment_method === "cash"
                    ? "Cash received (RM)"
                    : "Verified amount received (RM)"}
                  <input
                    name="tendered"
                    type="number"
                    step="0.01"
                    min={order.total_sen / 100}
                    defaultValue={order.total_sen / 100}
                    required
                  />
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" required />I checked that the full
                  payment was received.
                </label>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (order.payment_method !== "cash" &&
                      !order.payment_reference)
                  }
                >
                  <Check size={16} />
                  {busy ? "Confirming…" : "Confirm payment & create sale"}
                </button>
                {order.payment_method !== "cash" &&
                  !order.payment_reference && (
                    <p>
                      Ask the customer to submit their transfer reference
                      through their order link before confirming.
                    </p>
                  )}
              </form>
            )}
            {!order.sale_id && order.status !== "cancelled" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  try {
                    await mutate({
                      operation: "cancel",
                      id: order.id,
                      reason: values.get("reason"),
                    });
                  } catch {}
                }}
              >
                <label>
                  Cancellation reason
                  <input name="reason" minLength={3} maxLength={150} required />
                </label>
                <button className="secondary" disabled={busy}>
                  Cancel unpaid order & release stock
                </button>
              </form>
            )}
            {order.sale_id &&
              ["paid", "ready", "dispatched"].includes(order.status) &&
              !isRefunded(order) && (
                <div className="toolbar">
                  {order.status === "paid" && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void mutate({
                          operation: "fulfill",
                          id: order.id,
                          status:
                            order.fulfillment === "pickup"
                              ? "ready"
                              : "dispatched",
                        }).catch(() => {})
                      }
                    >
                      {order.fulfillment === "pickup"
                        ? "Mark ready for collection"
                        : "Mark dispatched"}
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        operation: "fulfill",
                        id: order.id,
                        status: "completed",
                      }).catch(() => {})
                    }
                  >
                    Mark completed
                  </button>
                </div>
              )}
            {order.sale_id && (
              <p>
                Paid sales appear in Sales History. Process any refund through
                Refunds; paid orders cannot be silently cancelled.
              </p>
            )}
            <a
              className="text-button"
              href={`/order/${order.tracking_token}`}
              target="_blank"
              rel="noreferrer"
            >
              Open customer order / receipt
            </a>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="overlay">
          <section
            className="modal online-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Online shop settings"
          >
            <div className="modal-heading">
              <h2>Online shop settings</h2>
              <button
                className="icon-btn"
                onClick={() => !busy && setSettingsOpen(false)}
                aria-label="Close shop settings"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                try {
                  const settings = {
                    enabled: values.get("enabled") === "on",
                    allow_pickup: values.get("allow_pickup") === "on",
                    allow_delivery: values.get("allow_delivery") === "on",
                    allow_cash_pickup: values.get("allow_cash_pickup") === "on",
                    pickup_address: String(values.get("pickup_address") || ""),
                    contact_phone: String(values.get("contact_phone") || ""),
                    delivery_fee_sen: parseAmount(
                      String(values.get("delivery_fee") || "0"),
                    ),
                    delivery_postcode_prefixes: String(
                      values.get("postcodes") || "",
                    )
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    delivery_areas: areaDraft.map((area) => ({
                      id: area.id,
                      name: String(
                        values.get(`area_${area.id}_name`) || "",
                      ).trim(),
                      postcodes: String(
                        values.get(`area_${area.id}_postcodes`) || "",
                      )
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      standard_fee_sen: parseAmount(
                        String(values.get(`area_${area.id}_fee`) || "0"),
                      ),
                      free_delivery_eligible:
                        values.get(`area_${area.id}_free`) === "on",
                    })),
                    delivery_note: String(values.get("delivery_note") || ""),
                    bank_name: String(values.get("bank_name") || ""),
                    bank_account_name: String(
                      values.get("bank_account_name") || "",
                    ),
                    bank_account_number: String(
                      values.get("bank_account_number") || "",
                    ),
                    duitnow_qr_url: String(values.get("duitnow_qr_url") || ""),
                  };
                  await mutate({ operation: "configure", settings });
                  setSettingsOpen(false);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Unable to save settings",
                  );
                }
              }}
            >
              <p>
                These details are visible to customers. Bank and QR payments are
                manually confirmed by staff. Stock must be entered through
                audited Inventory adjustments.
              </p>
              {(
                [
                  "enabled",
                  "allow_pickup",
                  "allow_delivery",
                  "allow_cash_pickup",
                ] as const
              ).map((k) => (
                <label className="checkbox-label" key={k}>
                  <input name={k} type="checkbox" defaultChecked={setting[k]} />
                  {
                    {
                      enabled: "Enable online orders",
                      allow_pickup: "Allow store pickup",
                      allow_delivery: "Allow delivery",
                      allow_cash_pickup: "Allow cash on pickup",
                    }[k]
                  }
                </label>
              ))}
              <label>
                Pickup address
                <textarea
                  name="pickup_address"
                  defaultValue={setting.pickup_address}
                  maxLength={1000}
                />
              </label>
              <label>
                Business contact phone
                <input
                  name="contact_phone"
                  defaultValue={setting.contact_phone}
                  maxLength={30}
                />
              </label>
              <label>
                Flat delivery fee (RM)
                <input
                  name="delivery_fee"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={setting.delivery_fee_sen / 100}
                  required
                />
              </label>
              <label>
                Delivery postcode prefixes (comma-separated; blank = all
                Malaysian postcodes)
                <input
                  name="postcodes"
                  placeholder="50, 51, 52"
                  defaultValue={setting.delivery_postcode_prefixes.join(", ")}
                />
              </label>
              <fieldset className="online-delivery-areas" disabled={busy}>
                <legend>Delivery areas &amp; RM300 free delivery</legend>
                <p>
                  Add exact five-digit postcodes and their standard fees. Only
                  mark an area eligible after verifying it is within Klang
                  Valley. No areas are assumed eligible. Your delivery postcode
                  restrictions above still apply.
                </p>
                {areaDraft.map((area, index) => (
                  <fieldset key={area.id} className="online-delivery-area">
                    <legend>Area {index + 1}</legend>
                    <label>
                      Area {index + 1} name
                      <input
                        name={`area_${area.id}_name`}
                        defaultValue={area.name}
                        maxLength={100}
                        required
                      />
                    </label>
                    <label>
                      Area {index + 1} postcodes (comma-separated)
                      <input
                        name={`area_${area.id}_postcodes`}
                        defaultValue={area.postcodes.join(", ")}
                        placeholder="Exact five-digit postcodes"
                        required
                      />
                    </label>
                    <label>
                      Area {index + 1} standard delivery fee (RM)
                      <input
                        name={`area_${area.id}_fee`}
                        type="number"
                        min="0"
                        max="100000"
                        step="0.01"
                        defaultValue={area.standard_fee_sen / 100}
                        required
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        name={`area_${area.id}_free`}
                        type="checkbox"
                        defaultChecked={area.free_delivery_eligible}
                      />
                      Area {index + 1} is in Klang Valley and eligible for free
                      delivery at RM300
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setAreaDraft((areas) =>
                          areas.filter((a) => a.id !== area.id),
                        )
                      }
                    >
                      Remove area {index + 1}
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={areaDraft.length >= 20}
                  onClick={() =>
                    setAreaDraft((areas) => [
                      ...areas,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        postcodes: [],
                        standard_fee_sen: setting.delivery_fee_sen,
                        free_delivery_eligible: false,
                      },
                    ])
                  }
                >
                  Add delivery area
                </button>
                <p>
                  Unlisted postcodes use the flat delivery fee, never automatic
                  free delivery. Each postcode may appear in only one area.
                  Pickup is always free.
                </p>
              </fieldset>
              <label>
                Delivery instructions / estimated timing
                <textarea
                  name="delivery_note"
                  defaultValue={setting.delivery_note}
                  maxLength={1000}
                />
              </label>
              <label>
                Bank name
                <input
                  name="bank_name"
                  defaultValue={setting.bank_name}
                  maxLength={150}
                />
              </label>
              <label>
                Bank account holder
                <input
                  name="bank_account_name"
                  defaultValue={setting.bank_account_name}
                  maxLength={150}
                />
              </label>
              <label>
                Bank account number
                <input
                  name="bank_account_number"
                  defaultValue={setting.bank_account_number}
                  maxLength={100}
                />
              </label>
              <label>
                DuitNow QR image URL (HTTPS)
                <input
                  name="duitnow_qr_url"
                  type="url"
                  value={OFFICIAL_DUITNOW_QR_URL}
                  readOnly
                />
              </label>
              <p>
                The official merchant-supplied DuitNow QR is included with this
                release. It is shown unchanged at checkout.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save online shop settings"}
                <Check size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
