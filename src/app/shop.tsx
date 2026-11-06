"use client";
import PaymentProofUpload from "@/components/payment-proof-upload";
import { OFFICIAL_DUITNOW_QR } from "@/lib/brand";
import type { UploadedProof } from "@/lib/payment-proof";
import BrandLogo from "@/components/brand-logo";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  ShoppingBag,
  Search,
  Plus,
  Minus,
  X,
  Leaf,
  Truck,
  Store,
  ShieldCheck,
  Check,
  RefreshCw,
} from "lucide-react";
import { money } from "@/lib/money";
import { deliveryQuote, FREE_DELIVERY_THRESHOLD_SEN } from "@/lib/delivery";
import type { Catalogue } from "@/lib/shop-types";
import "./shop.css";
type Line = { product_id: string; quantity: number };
export default function Shop() {
  const router = useRouter();
  const [data, setData] = useState<Catalogue | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [cart, setCart] = useState<Line[]>([]),
    [open, setOpen] = useState(false),
    [checkout, setCheckout] = useState(false),
    [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup"),
    [method, setMethod] = useState("cash"),
    [busy, setBusy] = useState(false),
    [agreed, setAgreed] = useState(false),
    [postcode, setPostcode] = useState(""),
    [address, setAddress] = useState(""),
    [proof, setProof] = useState<(UploadedProof & { context: string }) | null>(
      null,
    ),
    [serverQuote, setServerQuote] = useState<{
      context: string;
      total_sen: number;
      error: string;
    } | null>(null),
    [quoteAttempt, setQuoteAttempt] = useState(0);
  const key = useRef("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/shop", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      setFulfillment((current) =>
        current === "pickup" && !result.store.allow_pickup
          ? "delivery"
          : current === "delivery" && !result.store.allow_delivery
            ? "pickup"
            : current,
      );
      // A stock refresh must not leave a basket above the latest availability.
      setCart((lines) =>
        lines
          .map((line) => ({
            ...line,
            quantity: Math.min(
              line.quantity,
              100,
              result.products.find(
                (p: { id: string; available: number }) =>
                  p.id === line.product_id,
              )?.available ?? 0,
            ),
          }))
          .filter((line) => line.quantity > 0),
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load the collection",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const refresh = setInterval(() => void load(), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
    };
  }, [load]);
  const products = data?.products ?? [],
    store = data?.store;
  const count = cart.reduce((n, l) => n + l.quantity, 0),
    subtotal = cart.reduce(
      (n, l) =>
        n +
        (products.find((p) => p.id === l.product_id)?.price_sen ?? 0) *
          l.quantity,
      0,
    );
  const quote = deliveryQuote({
    fulfillment,
    postcode,
    address,
    subtotal_sen: subtotal,
    default_fee_sen: store?.delivery_fee_sen ?? 0,
    areas: store?.delivery_areas ?? [],
    postcode_prefixes: store?.delivery_postcode_prefixes ?? [],
  });
  const fee = quote.fee_sen,
    tax = Math.floor(((subtotal + fee) * (store?.tax_bps ?? 0) + 5000) / 10000),
    total = subtotal + fee + tax;
  const proofContext = JSON.stringify({
    items: cart,
    fulfillment,
    postcode: postcode.trim(),
    address: address.trim(),
    total,
  });
  const qrVerified =
    serverQuote?.context === proofContext &&
    !serverQuote.error &&
    serverQuote.total_sen === total;
  const validProof =
    proof?.context === proofContext && qrVerified ? proof : null;
  useEffect(() => {
    if (method !== "duitnow" || !checkout) return;
    const context = JSON.parse(proofContext);
    if (
      !context.items.length ||
      (context.fulfillment === "delivery" &&
        (!/^\d{5}$/.test(context.postcode) || context.address.length < 10))
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { total: estimated, ...payload } = context;
        const response = await fetch("/api/shop/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const checked = await response.json();
        if (!response.ok) throw new Error(checked.error);
        if (checked.total_sen !== estimated)
          throw new Error(
            "Prices or delivery charges changed. Refresh the collection before paying.",
          );
        if (!controller.signal.aborted)
          setServerQuote({
            context: proofContext,
            total_sen: checked.total_sen,
            error: "",
          });
      } catch (e) {
        if (!controller.signal.aborted)
          setServerQuote({
            context: proofContext,
            total_sen: 0,
            error:
              e instanceof Error ? e.message : "Unable to check order amount",
          });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [method, checkout, proofContext, quoteAttempt]);
  const categories = [
    "All",
    ...new Set(products.map((p) => p.category || "Collection")),
  ];
  const visible = products.filter(
    (p) =>
      (category === "All" || (p.category || "Collection") === category) &&
      `${p.name} ${p.english_name ?? ""} ${p.sku}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const canBank = Boolean(store?.bank_transfer_available),
    canQR = Boolean(store?.duitnow_available);
  const paymentOptions = [
    ...(fulfillment === "pickup" && store?.allow_cash_pickup
      ? [{ id: "cash", label: "Pay cash on collection" }]
      : []),
    ...(canBank ? [{ id: "bank", label: "Bank transfer" }] : []),
    ...(canQR ? [{ id: "duitnow", label: "Touch ’n Go / DuitNow QR" }] : []),
  ];
  function quantity(id: string, delta: number) {
    const p = products.find((p) => p.id === id);
    if (!p || busy || !store?.enabled || p.available <= 0) return;
    key.current = "";
    setCart((lines) => {
      const old = lines.find((l) => l.product_id === id);
      const q = Math.max(
        0,
        Math.min(100, p.available, (old?.quantity ?? 0) + delta),
      );
      return old
        ? lines
            .map((l) => (l.product_id === id ? { ...l, quantity: q } : l))
            .filter((l) => l.quantity > 0)
        : q > 0
          ? [...lines, { product_id: id, quantity: q }]
          : lines;
    });
  }
  function beginCheckout() {
    if (!store) return;
    const f =
      fulfillment === "pickup" && !store.allow_pickup
        ? "delivery"
        : fulfillment === "delivery" && !store.allow_delivery
          ? "pickup"
          : fulfillment;
    setFulfillment(f);
    setMethod(
      f === "pickup" && store.allow_cash_pickup
        ? "cash"
        : canBank
          ? "bank"
          : canQR
            ? "duitnow"
            : "",
    );
    setCheckout(true);
    setAgreed(false);
    key.current = "";
  }
  function changeFulfillment(f: "pickup" | "delivery") {
    setFulfillment(f);
    setMethod(
      f === "pickup" && store?.allow_cash_pickup
        ? "cash"
        : canBank
          ? "bank"
          : canQR
            ? "duitnow"
            : "",
    );
    key.current = "";
  }
  const deliveryFields = (
    <div className="shop-delivery-fields">
      <label>
        How would you like your order?
        <select
          aria-label="Fulfillment method"
          value={fulfillment}
          disabled={busy}
          onChange={(e) =>
            changeFulfillment(e.target.value as "pickup" | "delivery")
          }
        >
          {store?.allow_pickup && (
            <option value="pickup">Collect from store</option>
          )}
          {store?.allow_delivery && <option value="delivery">Delivery</option>}
        </select>
      </label>
      {fulfillment === "pickup" ? (
        <p className="shop-checkout-note">Pickup: {store?.pickup_address}</p>
      ) : (
        <>
          {!!store?.delivery_areas?.length && (
            <label>
              Delivery area
              <select
                aria-label="Delivery area"
                value={quote.area ? postcode : ""}
                disabled={busy}
                onChange={(e) => {
                  setPostcode(e.target.value);
                  key.current = "";
                }}
              >
                <option value="">Other area / enter postcode</option>
                {store.delivery_areas.map((area) => (
                  <optgroup key={area.id} label={area.name}>
                    {area.postcodes.map((code) => (
                      <option value={code} key={code}>
                        {area.name} · {code}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <label>
            Complete Malaysian delivery address
            <textarea
              name="address"
              autoComplete="street-address"
              minLength={10}
              maxLength={1000}
              required
              disabled={busy}
              placeholder="Street, unit, city and state"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                key.current = "";
              }}
            />
          </label>
          <label>
            Postcode
            <input
              name="postcode"
              inputMode="numeric"
              autoComplete="postal-code"
              pattern="[0-9]{5}"
              maxLength={5}
              required
              disabled={busy}
              value={postcode}
              onChange={(e) => {
                setPostcode(e.target.value);
                key.current = "";
              }}
            />
          </label>
          <p className="shop-checkout-note">{store?.delivery_note}</p>
          <p className="shop-checkout-note">
            Exact configured postcodes only. Other areas use the standard
            delivery charge.
          </p>
        </>
      )}
    </div>
  );
  const progressMessage =
    fulfillment === "pickup"
      ? "Pickup has no delivery fee."
      : !quote.confirmed
        ? "Select your delivery area to check free delivery eligibility."
        : !quote.deliverable
          ? "This postcode is outside our delivery area."
          : !quote.eligible
            ? "Free delivery is available within Klang Valley only."
            : quote.remaining_sen > 0
              ? `Add ${money(quote.remaining_sen)} more to unlock FREE DELIVERY within Klang Valley!`
              : "Congratulations! You've unlocked FREE DELIVERY!";
  const deliveryProgress = (
    <aside className={`shop-delivery-progress${quote.free ? " unlocked" : ""}`}>
      <p role="status">{progressMessage}</p>
      {fulfillment === "delivery" && (
        <>
          <div
            role="progressbar"
            aria-label="Progress towards RM300 product subtotal"
            aria-valuemin={0}
            aria-valuemax={FREE_DELIVERY_THRESHOLD_SEN}
            aria-valuenow={Math.min(
              FREE_DELIVERY_THRESHOLD_SEN,
              quote.net_subtotal_sen,
            )}
          >
            <span
              style={{
                width: `${Math.min(100, (quote.net_subtotal_sen / FREE_DELIVERY_THRESHOLD_SEN) * 100)}%`,
              }}
            />
          </div>
          <small>
            {money(quote.net_subtotal_sen)} /{" "}
            {money(FREE_DELIVERY_THRESHOLD_SEN)} · Products after discounts,
            before delivery and tax
          </small>
        </>
      )}
    </aside>
  );
  const orderTotals = (
    <div className="shop-totals">
      <div>
        <span>Product subtotal</span>
        <strong>{money(subtotal)}</strong>
      </div>
      <div>
        <span>{fulfillment === "delivery" ? "Delivery" : "Pickup"}</span>
        <strong>{money(fee)}</strong>
      </div>
      {quote.delivery_discount_sen > 0 && (
        <div className="shop-delivery-saving">
          <span>
            Free delivery discount{" "}
            <small>
              (included above; standard fee {money(quote.standard_fee_sen)})
            </small>
          </span>
          <strong>−{money(quote.delivery_discount_sen)}</strong>
        </div>
      )}
      <div>
        <span>Tax</span>
        <strong>{money(tax)}</strong>
      </div>
      <div className="shop-grand-total">
        <span>Total</span>
        <strong>{money(total)}</strong>
      </div>
    </div>
  );
  return (
    <div className="shop">
      <div className="shop-announcement">
        A little more extraordinary.{" "}
        <span>Thoughtfully selected in Malaysia.</span>
      </div>
      <header className="shop-header">
        <Link href="/" className="shop-brand">
          <BrandLogo priority />
          <span>
            CHIPSTI<small>ENTERPRISE</small>
          </span>
        </Link>
        <nav>
          <a href="#collection">The collection</a>
          <a href="#our-story">Our story</a>
          <a href="#shop-help">Pickup & delivery</a>
        </nav>
        <button
          className="shop-basket"
          onClick={() => {
            setOpen(true);
            setCheckout(false);
          }}
          aria-label={`Open basket, ${count} items`}
        >
          <ShoppingBag size={20} />
          <span>Basket</span>
          <b>{count}</b>
        </button>
      </header>
      <main>
        <section className="shop-hero">
          <div>
            <span className="shop-eyebrow">THE CHIPSTI COLLECTION</span>
            <h1>
              Small indulgences.
              <br />
              <em>Beautiful moments.</em>
            </h1>
            <p>
              Discover delightful snacks, thoughtful gifts and everyday
              favourites. A collection chosen with care, for you to enjoy and
              share.
            </p>
            <a href="#collection" className="shop-primary">
              Explore the collection
              <ArrowRight size={17} />
            </a>
            <div className="shop-hero-note">
              <Leaf size={16} />
              Good things, thoughtfully selected.
            </div>
          </div>
          <div className="shop-hero-art" aria-hidden="true">
            <span className="shop-art-circle" />
            <div className="shop-art-bag rear">
              <span>CHIPSTI</span>
              <Leaf size={56} strokeWidth={1} />
              <small>MADE FOR MOMENTS</small>
            </div>
            <div className="shop-art-bag front">
              <span>CHIPSTI</span>
              <Leaf size={65} strokeWidth={1} />
              <small>A LITTLE MORE EXTRAORDINARY</small>
            </div>
            <span className="shop-art-caption">THE ART OF A LITTLE TREAT</span>
          </div>
        </section>
        <div className="shop-values">
          <span>
            <Leaf size={18} />
            Curated with care
          </span>
          <span>
            <Store size={18} />
            Convenient store pickup
          </span>
          <span>
            <Truck size={18} />
            Delivery available
          </span>
          <span>
            <ShieldCheck size={18} />
            Secure order handling
          </span>
        </div>
        <section className="shop-collection" id="collection">
          <div className="shop-section-heading">
            <div>
              <span className="shop-eyebrow">FIND YOUR NEXT FAVOURITE</span>
              <h2>The collection</h2>
            </div>
            <label className="shop-search">
              <Search size={17} />
              <input
                aria-label="Search collection"
                placeholder="Search products or SKU…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="shop-categories">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "chosen" : ""}
                onClick={() => setCategory(c)}
              >
                {c === "All" ? "All products" : c}
              </button>
            ))}
          </div>
          <aside className="shop-delivery-banner">
            <Truck size={22} aria-hidden="true" />
            <span>
              <strong>FREE DELIVERY</strong>
              <span className="shop-banner-divider"> | </span>Spend RM300 &amp;
              above within Klang Valley
            </span>
          </aside>
          {loading ? (
            <div className="shop-loading" role="status">
              <RefreshCw size={22} className="spin" />
              Preparing the collection…
            </div>
          ) : !data ? (
            <div className="shop-unavailable" role="status">
              <h3>Our collection is being prepared.</h3>
              <p>{error}</p>
              <button className="shop-secondary" onClick={() => void load()}>
                Try again
                <RefreshCw size={16} />
              </button>
            </div>
          ) : (
            <>
              {!store?.enabled && (
                <div className="shop-store-notice">
                  Browse our collection. Online ordering is opening soon.
                </div>
              )}
              <div className="shop-grid">
                {visible.map((p, i) => (
                  <article className="shop-product" key={p.id}>
                    <div className={`shop-product-image shade-${i % 4}`}>
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt={p.name}
                          width={500}
                          height={500}
                          unoptimized
                        />
                      ) : (
                        <div className="shop-mini-bag" aria-hidden="true">
                          <span>CHIPSTI</span>
                          <Leaf size={38} strokeWidth={1} />
                          <small>{p.sku}</small>
                        </div>
                      )}
                      <span className="shop-stock-label">
                        {p.available > 0 ? "Available" : "Currently sold out"}
                      </span>
                    </div>
                    <div className="shop-product-info">
                      <small>
                        {p.category ?? "The collection"} · {p.sku}
                      </small>
                      <h3>{p.english_name?.trim() || p.name}</h3>
                      {p.english_name?.trim() && <p lang="zh">{p.name}</p>}
                      <div className="shop-product-purchase">
                        <strong>{money(p.price_sen)}</strong>
                        <div
                          className="shop-card-quantity"
                          role="group"
                          aria-label={`${p.sku} quantity`}
                        >
                          <button
                            onClick={() => quantity(p.id, -1)}
                            disabled={
                              busy ||
                              !store?.enabled ||
                              p.available <= 0 ||
                              !cart.find((l) => l.product_id === p.id)?.quantity
                            }
                            aria-label={`Remove ${p.sku} from basket`}
                          >
                            <Minus size={18} aria-hidden="true" />
                          </button>
                          <output
                            aria-label={`Selected quantity for ${p.sku}`}
                            aria-live="polite"
                          >
                            {cart.find((l) => l.product_id === p.id)
                              ?.quantity ?? 0}
                          </output>
                          <button
                            onClick={() => quantity(p.id, 1)}
                            disabled={
                              busy ||
                              !store?.enabled ||
                              p.available <= 0 ||
                              (cart.find((l) => l.product_id === p.id)
                                ?.quantity ?? 0) >= Math.min(100, p.available)
                            }
                            aria-label={`Add ${p.sku} to basket`}
                          >
                            <Plus size={18} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {p.description && (
                      <p className="shop-product-description">
                        {p.description}
                      </p>
                    )}
                  </article>
                ))}
              </div>
              {visible.length === 0 && (
                <div className="shop-unavailable">
                  <h3>No products found</h3>
                  <p>Try another search or collection.</p>
                </div>
              )}
            </>
          )}
        </section>
        <section className="shop-story" id="our-story">
          <Leaf size={37} strokeWidth={1} />
          <span className="shop-eyebrow">A NOTE FROM CHIPSTI</span>
          <h2>
            It’s the little things
            <br />
            that make a day.
          </h2>
          <p>
            A favourite snack. A thoughtful gift. Something lovely to share.
            <br />
            We bring together products that make everyday moments feel a little
            more special.
          </p>
        </section>
        <section className="shop-help" id="shop-help">
          <div>
            <Store size={23} />
            <h3>Collect at your convenience</h3>
            <p>
              {store?.pickup_address ||
                "Choose store pickup at checkout. Collection details will appear with your order once pickup is configured."}
            </p>
          </div>
          <div>
            <Truck size={23} />
            <h3>A little joy, delivered</h3>
            <p>
              {store?.delivery_note ||
                "Delivery availability and charges are shown at checkout when online ordering is open."}
            </p>
          </div>
          <div>
            <ShieldCheck size={23} />
            <h3>Order with confidence</h3>
            <p>
              Order totals are confirmed at checkout. Transfer and DuitNow
              payments are checked by our team before an order is marked paid.
            </p>
          </div>
        </section>
      </main>
      <footer className="shop-footer">
        <div className="shop-footer-brand">
          <BrandLogo className="footer-logo" />
          CHIPSTI ENTERPRISE<small>SSM: 202603232290 (RA0139100-V)</small>
        </div>
        <span>Malaysia · MYR</span>
        <Link href="/admin">
          Staff sign in
          <ArrowRight size={13} />
        </Link>
      </footer>
      {open && (
        <div className="shop-overlay">
          <section
            className="shop-cart"
            role="dialog"
            aria-modal="true"
            aria-label={checkout ? "Online checkout" : "Your basket"}
          >
            <div className="shop-cart-heading">
              <BrandLogo className="checkout-logo" />
              <div>
                <span className="shop-eyebrow">SOMETHING GOOD AWAITS</span>
                <h2>{checkout ? "Checkout" : "Your basket"}</h2>
              </div>
              <button
                className="shop-icon"
                onClick={() => !busy && setOpen(false)}
                aria-label="Close basket"
              >
                <X />
              </button>
            </div>
            {!cart.length ? (
              <div className="shop-empty">
                <ShoppingBag size={38} strokeWidth={1} />
                <h3>A fresh start.</h3>
                <p>Add something lovely from the collection.</p>
                <button className="shop-primary" onClick={() => setOpen(false)}>
                  Explore products
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="shop-cart-items">
                  {cart.map((l) => {
                    const p = products.find((p) => p.id === l.product_id);
                    if (!p) return null;
                    return (
                      <div className="shop-cart-item" key={p.id}>
                        <div>
                          <h3>{p.english_name?.trim() || p.name}</h3>
                          {p.english_name?.trim() && (
                            <p className="shop-cart-chinese" lang="zh">
                              {p.name}
                            </p>
                          )}
                          <small>
                            {p.sku} · {money(p.price_sen)} each
                          </small>
                          <div className="shop-quantity">
                            <button
                              disabled={busy}
                              onClick={() => quantity(p.id, -1)}
                              aria-label={`Remove one ${p.sku}`}
                            >
                              <Minus size={14} />
                            </button>
                            <span>{l.quantity}</span>
                            <button
                              disabled={
                                busy || l.quantity >= Math.min(100, p.available)
                              }
                              onClick={() => quantity(p.id, 1)}
                              aria-label={`Add one ${p.sku}`}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        <strong>{money(p.price_sen * l.quantity)}</strong>
                      </div>
                    );
                  })}
                </div>
                {deliveryProgress}
                {checkout ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!agreed) return;
                      if (method === "duitnow" && !validProof) {
                        setError(
                          "Upload payment proof for the current order total first.",
                        );
                        return;
                      }
                      const form = new FormData(e.currentTarget);
                      setBusy(true);
                      setError("");
                      key.current ||= crypto.randomUUID();
                      try {
                        const response = await fetch("/api/shop/order", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            key: key.current,
                            expected_total_sen: total,
                            items: cart,
                            fulfillment,
                            payment_method: method,
                            ...(method === "duitnow"
                              ? {
                                  proof_id: validProof?.id,
                                  proof_token: validProof?.token,
                                  payment_reference:
                                    form.get("payment_reference") || "",
                                }
                              : {}),
                            name: form.get("name"),
                            phone: form.get("phone"),
                            email: form.get("email"),
                            address:
                              fulfillment === "delivery" ? address.trim() : "",
                            postcode:
                              fulfillment === "delivery" ? postcode.trim() : "",
                            notes: form.get("notes"),
                            website: form.get("website"),
                          }),
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error);
                        router.push(`/order/${result.token}`);
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Unable to place your order",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <fieldset disabled={busy}>
                      <div className="shop-form-grid">
                        <label>
                          Full name
                          <input
                            name="name"
                            autoComplete="name"
                            maxLength={150}
                            required
                          />
                        </label>
                        <label>
                          Contact number
                          <input
                            name="phone"
                            type="tel"
                            autoComplete="tel"
                            maxLength={30}
                            required
                          />
                        </label>
                        <label className="wide">
                          Email (optional)
                          <input
                            name="email"
                            type="email"
                            autoComplete="email"
                            maxLength={254}
                          />
                        </label>
                      </div>
                      {deliveryFields}
                      <label>
                        Payment method
                        <select
                          aria-label="Online payment method"
                          value={method}
                          onChange={(e) => {
                            setMethod(e.target.value);
                            key.current = "";
                          }}
                          required
                        >
                          <option value="" disabled>
                            Select payment method
                          </option>
                          {paymentOptions.map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="shop-checkout-note">
                        {method === "cash"
                          ? "Pay when you collect. Your order will be marked paid only after our team receives payment."
                          : "Payment instructions will appear after placing your order. Transfers are manually verified by our team."}
                      </p>
                      {method === "duitnow" && (
                        <section
                          className="shop-qr-payment"
                          aria-label="Touch 'n Go / DuitNow QR payment"
                        >
                          <h3>Pay CHIPSTI ENTERPRISE</h3>
                          <p className="shop-pay-amount">
                            Amount to pay: <strong>{money(total)}</strong>
                          </p>
                          {!qrVerified ? (
                            <div role="status">
                              <p>
                                {serverQuote?.context === proofContext &&
                                serverQuote.error
                                  ? serverQuote.error
                                  : fulfillment === "delivery" &&
                                      !quote.confirmed
                                    ? "Enter your complete delivery address above to check the amount before paying."
                                    : "Checking the exact order amount with our server…"}
                              </p>
                              <button
                                type="button"
                                className="shop-secondary"
                                onClick={() => setQuoteAttempt((n) => n + 1)}
                              >
                                Check amount again
                              </button>
                            </div>
                          ) : (
                            <>
                              <Image
                                src={OFFICIAL_DUITNOW_QR}
                                alt="Official CHIPSTI ENTERPRISE DuitNow QR — Touch 'n Go eWallet"
                                width={760}
                                height={1080}
                                className="shop-qr"
                                unoptimized
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
                              <ol>
                                <li>
                                  Open Touch ’n Go eWallet or a supported
                                  Malaysian banking app.
                                </li>
                                <li>
                                  Scan the QR code and confirm the recipient is
                                  CHIPSTI ENTERPRISE.
                                </li>
                                <li>Pay the exact order amount shown above.</li>
                                <li>Save the successful payment receipt.</li>
                                <li>Upload the receipt below.</li>
                                <li>
                                  Submit your order for manual payment
                                  verification.
                                </li>
                              </ol>
                              <p>
                                On this phone, save the QR image and use your
                                payment app’s scan-from-gallery option if
                                supported.
                              </p>
                              {proof && !validProof && (
                                <p className="shop-error">
                                  Your basket or delivery details changed.
                                  Upload proof for the updated order total.
                                </p>
                              )}
                              <PaymentProofUpload
                                key={proofContext}
                                totalSen={total}
                                disabled={busy}
                                onUploaded={(value) =>
                                  setProof(
                                    value
                                      ? { ...value, context: proofContext }
                                      : null,
                                  )
                                }
                              />
                            </>
                          )}
                          <label>
                            Payment reference (optional)
                            <input name="payment_reference" maxLength={150} />
                          </label>
                          <p>
                            <strong>Pending Verification:</strong> a receipt
                            upload does not confirm payment. Our team will check
                            the merchant payment account.
                          </p>
                        </section>
                      )}
                      <label>
                        Order notes (optional)
                        <textarea name="notes" maxLength={1000} />
                      </label>
                      <label className="shop-honeypot" aria-hidden="true">
                        Website
                        <input
                          name="website"
                          tabIndex={-1}
                          autoComplete="off"
                        />
                      </label>
                      {orderTotals}
                      <label className="shop-agreement">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                          required
                        />
                        I agree to the order total and authorize CHIPSTI to use
                        my contact details to process this order.
                      </label>
                      <p className="shop-checkout-note">
                        Stock is reserved for 24 hours after your order is
                        submitted, while it awaits payment confirmation. Save
                        your private order link to check its status. We do not
                        enroll you in marketing.
                      </p>
                      {error && (
                        <p className="shop-error" role="alert">
                          {error}
                        </p>
                      )}
                      <button
                        className="shop-primary full"
                        disabled={
                          busy ||
                          !method ||
                          !agreed ||
                          total <= 0 ||
                          (method === "duitnow" && !validProof) ||
                          (fulfillment === "delivery" &&
                            (!quote.confirmed || !quote.deliverable))
                        }
                      >
                        {busy ? "Placing your order…" : "Place order"}
                        <Check size={17} />
                      </button>
                      <button
                        type="button"
                        className="shop-back"
                        onClick={() => setCheckout(false)}
                      >
                        Back to basket
                      </button>
                    </fieldset>
                  </form>
                ) : (
                  <>
                    <div className="shop-delivery-estimate">
                      <h3>Pickup & delivery estimate</h3>
                      {deliveryFields}
                    </div>
                    {orderTotals}
                    <p className="shop-checkout-note">
                      Delivery and tax estimates update with your postcode.
                      Confirm your complete address before ordering.
                    </p>
                    <button
                      className="shop-primary full"
                      disabled={!store?.enabled}
                      onClick={beginCheckout}
                    >
                      Continue to checkout
                      <ArrowRight size={17} />
                    </button>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
