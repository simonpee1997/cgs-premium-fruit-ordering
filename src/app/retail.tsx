"use client";
import ReceiptPdfActions from "@/components/receipt-pdf-actions";
import { SaleReceiptPaymentDetails } from "@/components/receipt-payment-details";
import BrandLogo from "@/components/brand-logo";
import OnlineOrders from "@/components/online-orders";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Boxes,
  Truck,
  Users,
  ReceiptText,
  RotateCcw,
  ChartNoAxesCombined,
  Wallet,
  UserRoundCog,
  Settings,
  Search,
  Plus,
  Minus,
  X,
  ArrowRight,
  LogOut,
  Sun,
  Moon,
  Menu,
  Printer,
  Download,
  Check,
  Leaf,
  ChevronRight,
  Store,
  Pause,
  Upload,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { money, localDate, discount, parseAmount } from "@/lib/money";
import type { AppData } from "@/lib/data";
type CartLine = { product_id: string; quantity: number; discount_sen: number };
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  value?: string | number | boolean;
};
const navigation = [
  ["Dashboard", LayoutDashboard],
  ["Point of Sale", ShoppingBag],
  ["Online Orders", ShoppingBag],
  ["Products", Package],
  ["Inventory", Boxes],
  ["Purchase Orders", Truck],
  ["Suppliers", Store],
  ["Customers", Users],
  ["Sales History", ReceiptText],
  ["Refunds", RotateCcw],
  ["Reports", ChartNoAxesCombined],
  ["Cashier Closing", Wallet],
  ["Staff Management", UserRoundCog],
  ["Settings", Settings],
] as const;
const methods = [
  { value: "cash", label: "Cash" },
  { value: "duitnow", label: "DuitNow QR" },
  { value: "bank", label: "Bank transfer" },
  { value: "debit", label: "Debit card" },
  { value: "credit", label: "Credit card" },
];
function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function Retail({ configured }: { configured: boolean }) {
  const [data, setData] = useState<AppData | null>(null),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState("Point of Sale"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [cart, setCart] = useState<CartLine[]>([]),
    [busy, setBusy] = useState(false),
    [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [receipt, setReceipt] = useState(""),
    [customer, setCustomer] = useState(""),
    [historyCustomer, setHistoryCustomer] = useState(""),
    [discountKind, setDiscountKind] = useState<"fixed" | "percent">("fixed"),
    [discountValue, setDiscountValue] = useState(0),
    [promotion, setPromotion] = useState(""),
    [paymentOpen, setPaymentOpen] = useState(false),
    [paymentMethod, setPaymentMethod] = useState("cash"),
    [tendered, setTendered] = useState(""),
    [reference, setReference] = useState(""),
    [splitAmount, setSplitAmount] = useState(""),
    [extraPayments, setExtraPayments] = useState<
      {
        method: string;
        amount_sen: number;
        tendered_sen: number;
        reference: string;
      }[]
    >([]),
    [modal, setModal] = useState<{
      title: string;
      action: string;
      fields: Field[];
      extra?: Record<string, unknown>;
    } | null>(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const checkoutKey = useRef("");
  const refresh = useCallback(async () => {
    try {
      if (!configured) return;
      const response = await fetch("/api/data", { cache: "no-store" });
      if (response.status === 401) {
        setData(null);
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 30000);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  async function act(action: string, payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setNotice("Saved successfully");
      return result.id as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const t = data?.tables ?? {};
  const products = t.products ?? [],
    sales = t.sales ?? [],
    items = t.sale_items ?? [],
    refunds = t.refunds ?? [],
    payments = t.payments ?? [],
    role = data?.profile.role ?? "cashier";
  const privileged = role === "owner" || role === "manager";
  const inventory = t.inventory ?? [];
  const stock = (id: string) =>
    inventory.find((i) => i.product_id === id)?.available ??
    inventory.find((i) => i.product_id === id)?.quantity ??
    0;
  const productOptions = products
    .filter((p) => !p.archived)
    .map((p) => ({ value: p.id as string, label: `${p.sku} · ${p.name}` }));
  const session = (t.cashier_sessions ?? []).find(
    (s) => s.status === "open" && s.cashier_id === data?.profile.id,
  );
  const subtotal = cart.reduce(
      (s, l) =>
        s +
        (products.find((p) => p.id === l.product_id)?.price_sen ?? 0) *
          l.quantity,
      0,
    ),
    itemDiscount = cart.reduce((s, l) => s + l.discount_sen, 0);
  let orderDiscount = 0;
  try {
    orderDiscount = discount(
      subtotal - itemDiscount,
      discountKind,
      discountValue,
    );
  } catch {
    orderDiscount = 0;
  }
  const activePromos = (t.promotions ?? []).filter(
    (p) =>
      p.active &&
      new Date(p.starts_at) <= new Date() &&
      new Date(p.ends_at) >= new Date(),
  );
  const promoBps =
    activePromos.find((p) => p.id === promotion)?.percent_bps ?? 0;
  orderDiscount += Math.floor(
    ((subtotal - itemDiscount) * promoBps + 5000) / 10000,
  );
  const tax = Math.floor(
      ((subtotal - itemDiscount - orderDiscount) *
        (t.system_settings?.[0]?.tax_bps ?? 0) +
        5000) /
        10000,
    ),
    total = subtotal - itemDiscount - orderDiscount + tax;
  const filtered = products.filter(
    (p) =>
      !p.archived &&
      (category === "all" || p.category_id === category) &&
      `${p.sku} ${p.name} ${p.english_name ?? ""} ${p.barcode ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function add(id: string) {
    setCart((c) => {
      const existing = c.find((l) => l.product_id === id);
      if ((existing?.quantity ?? 0) >= stock(id)) {
        setError("No more stock available");
        return c;
      }
      return existing
        ? c.map((l) =>
            l.product_id === id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...c, { product_id: id, quantity: 1, discount_sen: 0 }];
    });
    checkoutKey.current = "";
  }
  function changeQty(id: string, delta: number) {
    setCart((c) =>
      c
        .map((l) =>
          l.product_id === id
            ? {
                ...l,
                quantity: Math.max(0, Math.min(stock(id), l.quantity + delta)),
                discount_sen: 0,
              }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
    checkoutKey.current = "";
  }
  const dateSales = sales.filter((s) => {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date(s.created_at));
    return (!from || date >= from) && (!to || date <= to);
  });
  const dateRefunds = refunds.filter((r) => {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date(r.created_at));
    return (!from || date >= from) && (!to || date <= to);
  });
  const revenue =
    dateSales.reduce((s, r) => s + r.total_sen - r.tax_sen, 0) -
    dateRefunds.reduce((s, r) => s + r.total_sen - r.tax_sen, 0);
  const unitsSold = (id: string) =>
    items
      .filter(
        (i) => i.product_id === id && dateSales.some((s) => s.id === i.sale_id),
      )
      .reduce((sum, i) => sum + i.quantity, 0);
  const rankedProducts = [...products].sort(
    (a, b) => unitsSold(b.id) - unitsSold(a.id),
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  const todaySales = sales.filter(
    (s) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
      }).format(new Date(s.created_at)) === today,
  );
  const soldCost = dateSales.reduce(
    (sum, s) =>
      sum +
      items
        .filter((i) => i.sale_id === s.id)
        .reduce(
          (n, i) =>
            n +
            ((t.sale_item_costs ?? []).find((c) => c.sale_item_id === i.id)
              ?.cost_sen ?? 0) *
              i.quantity,
          0,
        ),
    0,
  );
  const returnedCost = (t.refund_items ?? [])
    .filter((i) => i.restock && dateRefunds.some((r) => r.id === i.refund_id))
    .reduce(
      (sum, i) =>
        sum +
        i.quantity *
          ((t.sale_item_costs ?? []).find(
            (c) => c.sale_item_id === i.sale_item_id,
          )?.cost_sen ?? 0),
      0,
    );
  function form(
    title: string,
    action: string,
    fields: Field[],
    extra?: Record<string, unknown>,
  ) {
    setModal({ title, action, fields, extra });
    setError("");
  }
  const productFields = (p?: (typeof products)[number]): Field[] => [
    { name: "sku", label: "SKU", value: p?.sku, required: true },
    { name: "name", label: "Product name", value: p?.name, required: true },
    {
      name: "english_name",
      label: "English name",
      value: p?.english_name ?? "",
    },
    { name: "description", label: "Description", value: p?.description ?? "" },
    { name: "barcode", label: "Barcode", value: p?.barcode ?? "" },
    {
      name: "category_id",
      label: "Category",
      type: "select",
      options: (t.product_categories ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
      value: p?.category_id,
    },
    {
      name: "price_sen",
      label: "Selling price (RM)",
      type: "number",
      value: p?.price_sen ?? 0,
      required: true,
    },
    {
      name: "cost_sen",
      label: "Cost (RM)",
      type: "number",
      value:
        (t.product_costs ?? []).find((c) => c.product_id === p?.id)?.cost_sen ??
        0,
      required: true,
    },
    {
      name: "low_stock",
      label: "Low-stock threshold",
      type: "number",
      value: p?.low_stock ?? 5,
    },
    {
      name: "image_url",
      label: "Image URL (or upload below)",
      value: p?.image_url ?? "",
    },
    {
      name: "archived",
      label: "Archived",
      type: "checkbox",
      value: p?.archived ?? false,
    },
  ];
  const receiptRef = useRef<HTMLElement>(null);
  const selectedSale = sales.find((s) => s.id === receipt);
  function exportSales() {
    const rows = [
      [
        "Receipt",
        "Malaysia date",
        "Subtotal sen",
        "Discount sen",
        "Tax sen",
        "Total sen",
        "Cashier",
      ],
      ...dateSales.map((s) => [
        s.receipt_number,
        localDate(s.created_at),
        s.subtotal_sen,
        s.discount_sen,
        s.tax_sen,
        s.total_sen,
        s.cashier_id,
      ]),
    ];
    download(
      "chipsti-sales.csv",
      "\uFEFF" +
        rows
          .map((row) =>
            row
              .map(
                (v) =>
                  '"' +
                  String(v)
                    .replace(/^[=+@-]/, "'$&")
                    .replaceAll('"', '""') +
                  '"',
              )
              .join(","),
          )
          .join("\r\n"),
    );
  }
  if (!data)
    return (
      <main className="login">
        <div className="login-art">
          <BrandLogo className="staff-logo" priority />
          <span className="eyebrow">CHIPSTI ENTERPRISE</span>
          <h1>
            A little more
            <br />
            <em>extraordinary.</em>
          </h1>
          <p>
            Thoughtfully selected products.
            <br />
            Beautifully simple retail.
          </p>
          <small>SSM 202603232290 (RA0139100-V)</small>
        </div>
        <div className="login-panel">
          <span className="eyebrow">YOUR STORE, CONNECTED</span>
          <h2>{configured ? "Welcome back." : "Let’s open your store."}</h2>
          <p>
            {configured
              ? "Sign in to your CHIPSTI workspace."
              : "Connect Supabase to securely manage your store."}
          </p>
          {!configured ? (
            <div className="setup-box">
              <h3>Database setup required</h3>
              <ol>
                <li>Create a Supabase project.</li>
                <li>
                  Run the SQL migration in <code>supabase/migrations</code>.
                </li>
                <li>
                  Set the two variables in <code>.env.local</code> using{" "}
                  <code>.env.example</code>.
                </li>
                <li>Provision the first owner following the README.</li>
                <li>Restart the application.</li>
              </ol>
              <p>No sample transactions or public owner registration.</p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const values = new FormData(e.currentTarget);
                try {
                  const r = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(Object.fromEntries(values)),
                  });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error);
                  await refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Sign-in failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
              </label>
              <button className="primary" disabled={busy || loading}>
                {busy ? "Signing in…" : "Sign in"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <small>Secure access · Authorized staff only</small>
        </div>
      </main>
    );
  return (
    <div className="workspace">
      <aside className={menu ? "sidebar expanded" : "sidebar"}>
        <div className="brand">
          <BrandLogo className="staff-logo" priority />
          <div>
            CHIPSTI<span>RETAIL ATELIER</span>
          </div>
        </div>
        <div className="store">
          <span className="store-icon">
            <Store size={18} />
          </span>
          <div>
            Main store<small>Malaysia · MYR</small>
          </div>
          <span className="live-dot" />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {navigation
            .filter(
              ([name]) =>
                role === "owner" ||
                (privileged &&
                  !["Staff Management", "Settings"].includes(name)) ||
                [
                  "Point of Sale",
                  "Customers",
                  "Sales History",
                  "Cashier Closing",
                ].includes(name),
            )
            .map(([name, Icon]) => (
              <button
                className={page === name ? "nav-item active" : "nav-item"}
                key={name}
                onClick={() => {
                  setPage(name);
                  setMenu(false);
                  setQuery("");
                }}
              >
                <Icon size={19} />
                {name}
                {page === name && <span className="nav-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <Leaf size={19} />
          <span>
            Small details.
            <br />
            <strong>Better business.</strong>
          </span>
        </div>
        <button
          className="profile"
          onClick={async () => {
            await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "logout" }),
            });
            setData(null);
            setCart([]);
          }}
        >
          <span className="avatar">
            {data.profile.display_name.slice(0, 1)}
          </span>
          <span>
            {data.profile.display_name}
            <small>{role}</small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <div className="main">
        <header>
          <button
            className="mobile-menu icon-btn"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} /> <strong>{page}</strong>
          </div>
          <div className="header-right">
            <span className="connection">
              <span className="live-dot" /> Connected
            </span>
            <button
              className="icon-btn"
              aria-label="Toggle theme"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar small">
              {data.profile.display_name.slice(0, 1)}
            </span>
          </div>
        </header>
        <div className="page-content">
          <div className="print-heading">
            <h1>CHIPSTI ENTERPRISE</h1>
            <p>SSM: 202603232290 (RA0139100-V)</p>
            <h2>{page}</h2>
            <p>
              {from || "All dates"} — {to || "Present"} · Asia/Kuala_Lumpur ·
              MYR
            </p>
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "Point of Sale"
                  ? "A GOOD DAY TO MAKE SOMEONE’S DAY"
                  : "CHIPSTI ENTERPRISE"}
              </span>
              <h1>{page === "Point of Sale" ? "Point of sale" : page}</h1>
              <p>
                {page === "Point of Sale"
                  ? "Good products. Great moments. Let’s make a sale."
                  : "Your store, thoughtfully organized."}
              </p>
            </div>
            <span className="date-chip">
              {new Intl.DateTimeFormat("en-MY", {
                timeZone: "Asia/Kuala_Lumpur",
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date())}
            </span>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Point of Sale" ? (
            <div className="pos-layout">
              <section className="catalog">
                <div className="search-box">
                  <Search size={19} />
                  <input
                    placeholder="Search products, SKU or scan barcode…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filtered.length === 1) {
                        e.preventDefault();
                        add(filtered[0].id);
                        setQuery("");
                      }
                    }}
                  />
                  <kbd>↵</kbd>
                </div>
                <div className="category-tabs">
                  <button
                    className={category === "all" ? "selected" : ""}
                    onClick={() => setCategory("all")}
                  >
                    All products{" "}
                    <span>{products.filter((p) => !p.archived).length}</span>
                  </button>
                  {(t.product_categories ?? []).map((c) => (
                    <button
                      key={c.id}
                      className={category === c.id ? "selected" : ""}
                      onClick={() => setCategory(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="section-label">
                  <span>THE COLLECTION</span>
                  <small>{filtered.length} products</small>
                </div>
                <div className="product-grid">
                  {filtered.map((p, i) => (
                    <button
                      className="product-card"
                      key={p.id}
                      disabled={stock(p.id) <= 0}
                      onClick={() => add(p.id)}
                    >
                      <div className={`product-visual tone-${i % 4}`}>
                        {p.image_url ? (
                          <Image
                            src={p.image_url}
                            alt={p.name}
                            width={300}
                            height={240}
                            unoptimized
                          />
                        ) : (
                          <div className="package-art">
                            <span>CHIPSTI</span>
                            <Leaf size={30} strokeWidth={1} />
                            <strong>{p.sku}</strong>
                            <small>THE SNACK COLLECTION</small>
                          </div>
                        )}
                        <span
                          className={
                            stock(p.id) > p.low_stock
                              ? "stock-badge"
                              : "stock-badge low"
                          }
                        >
                          {stock(p.id) > 0
                            ? `${stock(p.id)} in stock`
                            : "Out of stock"}
                        </span>
                        <span className="add-product">
                          <Plus size={18} />
                        </span>
                      </div>
                      <div className="product-info">
                        <small>{p.sku}</small>
                        <h3>
                          {p.name}
                          {p.english_name && (
                            <span className="product-english-name" lang="en">
                              {p.english_name}
                            </span>
                          )}
                        </h3>
                        <strong>{money(p.price_sen)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <div className="empty">
                    <Package />
                    <h3>No products found</h3>
                    <p>Try another name, SKU or category.</p>
                  </div>
                )}
                <p className="catalog-note">
                  <Leaf size={14} /> Curated with care. Sold with a smile.
                </p>
              </section>
              <section className="cart-panel">
                <div className="cart-header">
                  <div>
                    <h2>
                      Current order{" "}
                      <span>{cart.reduce((s, l) => s + l.quantity, 0)}</span>
                    </h2>
                    <small>
                      {session
                        ? "Cashier session open"
                        : "Open a cashier session before checkout"}
                    </small>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setCart([]);
                      checkoutKey.current = "";
                    }}
                    aria-label="Clear cart"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="customer-select">
                  <Users size={18} />
                  <select
                    aria-label="Customer"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                  >
                    <option value="">Walk-in customer</option>
                    {(t.customers ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.phone}
                      </option>
                    ))}
                  </select>
                  <Plus size={16} />
                </div>
                <div className="cart-lines">
                  {!cart.length ? (
                    <div className="empty">
                      <ShoppingBag size={34} strokeWidth={1} />
                      <h3>A fresh start.</h3>
                      <p>Tap a product to begin your order.</p>
                    </div>
                  ) : (
                    cart.map((l) => {
                      const p = products.find((p) => p.id === l.product_id)!;
                      return (
                        <div className="cart-line" key={p.id}>
                          <div className="cart-line-top">
                            <div>
                              <h3>
                                {p.name}
                                {p.english_name?.trim() &&
                                  p.english_name.trim() !== p.name.trim() && (
                                    <span
                                      className="product-english-name"
                                      lang="en"
                                    >
                                      {p.english_name.trim()}
                                    </span>
                                  )}
                              </h3>
                              <small>
                                {p.sku} · {money(p.price_sen)}
                              </small>
                            </div>
                            <strong>
                              {money(p.price_sen * l.quantity - l.discount_sen)}
                            </strong>
                          </div>
                          <div className="cart-line-bottom">
                            <div className="quantity">
                              <button
                                aria-label={`Decrease ${p.sku}`}
                                onClick={() => changeQty(p.id, -1)}
                              >
                                <Minus size={13} />
                              </button>
                              <span>{l.quantity}</span>
                              <button
                                aria-label={`Increase ${p.sku}`}
                                onClick={() => changeQty(p.id, 1)}
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                            <label className="item-discount">
                              Discount (RM)
                              <input
                                type="number"
                                min="0"
                                max={(p.price_sen * l.quantity) / 100}
                                step="0.01"
                                value={l.discount_sen / 100}
                                onChange={(e) => {
                                  setCart((c) =>
                                    c.map((x) =>
                                      x.product_id === p.id
                                        ? {
                                            ...x,
                                            discount_sen: Math.round(
                                              Number(e.target.value) * 100,
                                            ),
                                          }
                                        : x,
                                    ),
                                  );
                                  checkoutKey.current = "";
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="cart-summary">
                  <div className="discount-controls">
                    <select
                      aria-label="Discount type"
                      value={discountKind}
                      onChange={(e) => {
                        setDiscountKind(e.target.value as "fixed" | "percent");
                        checkoutKey.current = "";
                      }}
                    >
                      <option value="fixed">Order discount · RM</option>
                      <option value="percent">Discount · %</option>
                    </select>
                    <input
                      aria-label="Order discount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue / 100}
                      onChange={(e) => {
                        setDiscountValue(
                          Math.round(Number(e.target.value) * 100),
                        );
                        checkoutKey.current = "";
                      }}
                    />
                  </div>
                  {activePromos.length > 0 && (
                    <select
                      aria-label="Promotion"
                      value={promotion}
                      onChange={(e) => {
                        setPromotion(e.target.value);
                        checkoutKey.current = "";
                      }}
                    >
                      <option value="">No promotion</option>
                      {activePromos.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Discounts</span>
                    <span>− {money(itemDiscount + orderDiscount)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Tax</span>
                    <span>{money(tax)}</span>
                  </div>
                  <div className="total-row">
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <button
                    className="primary checkout"
                    disabled={!cart.length || !session || busy || total < 0}
                    onClick={() => {
                      setPaymentOpen(true);
                      setTendered(String(total));
                      setExtraPayments([]);
                    }}
                  >
                    Charge {money(total)}
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="hold-button"
                    disabled={!cart.length || busy}
                    onClick={() =>
                      form(
                        "Hold this order",
                        "hold",
                        [
                          {
                            name: "label",
                            label: "Order name",
                            required: true,
                          },
                        ],
                        { cart },
                      )
                    }
                  >
                    <Pause size={15} />
                    Hold order
                  </button>
                  <div className="secure-note">Secure checkout · MYR</div>
                </div>
              </section>
            </div>
          ) : (
            <>
              {["Dashboard", "Reports"].includes(page) && (
                <>
                  <div className="toolbar">
                    <label>
                      From
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                    <button className="secondary" onClick={exportSales}>
                      <Download size={16} />
                      Export CSV
                    </button>
                    {role === "owner" && (
                      <a
                        className="secondary"
                        href={`/api/export?from=${from}&to=${to}`}
                      >
                        <Download size={16} />
                        Excel
                      </a>
                    )}
                    <button
                      className="secondary"
                      onClick={() => window.print()}
                    >
                      <Printer size={16} />
                      Print / PDF
                    </button>
                  </div>
                  <div className="toolbar">
                    {[
                      "Today",
                      "This week",
                      "This month",
                      "This year",
                      "All time",
                    ].map((period) => (
                      <button
                        className="secondary"
                        key={period}
                        onClick={() => {
                          const current = new Date(`${today}T12:00:00+08:00`);
                          let start = "";
                          if (period === "Today") start = today;
                          if (period === "This month")
                            start = today.slice(0, 7) + "-01";
                          if (period === "This year")
                            start = today.slice(0, 4) + "-01-01";
                          if (period === "This week") {
                            const day = (current.getUTCDay() + 6) % 7;
                            current.setUTCDate(current.getUTCDate() - day);
                            start = new Intl.DateTimeFormat("en-CA", {
                              timeZone: "Asia/Kuala_Lumpur",
                            }).format(current);
                          }
                          setFrom(start);
                          setTo(period === "All time" ? "" : today);
                        }}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                  <div className="metrics">
                    <Metric
                      label="Today’s sales · incl. tax"
                      value={money(
                        todaySales.reduce((s, r) => s + r.total_sen, 0),
                      )}
                    />
                    <Metric
                      label="Yesterday · incl. tax"
                      value={money(
                        sales
                          .filter((s) => {
                            const d = new Date(`${today}T12:00:00+08:00`);
                            d.setUTCDate(d.getUTCDate() - 1);
                            return (
                              new Intl.DateTimeFormat("en-CA", {
                                timeZone: "Asia/Kuala_Lumpur",
                              }).format(new Date(s.created_at)) ===
                              new Intl.DateTimeFormat("en-CA", {
                                timeZone: "Asia/Kuala_Lumpur",
                              }).format(d)
                            );
                          })
                          .reduce((sum, s) => sum + s.total_sen, 0),
                      )}
                    />
                    <Metric
                      label="This month · incl. tax"
                      value={money(
                        sales
                          .filter((s) =>
                            new Intl.DateTimeFormat("en-CA", {
                              timeZone: "Asia/Kuala_Lumpur",
                            })
                              .format(new Date(s.created_at))
                              .startsWith(today.slice(0, 7)),
                          )
                          .reduce((sum, s) => sum + s.total_sen, 0),
                      )}
                    />
                    <Metric
                      label="Net revenue · excl. tax"
                      value={money(revenue)}
                    />
                    <Metric
                      label="Transactions"
                      value={String(dateSales.length)}
                    />
                    <Metric
                      label="Average sale · incl. tax"
                      value={money(
                        dateSales.length
                          ? Math.round(
                              dateSales.reduce((s, r) => s + r.total_sen, 0) /
                                dateSales.length,
                            )
                          : 0,
                      )}
                    />
                    {role === "owner" && (
                      <>
                        <Metric
                          label="Gross profit"
                          value={money(revenue - soldCost + returnedCost)}
                        />
                        <Metric
                          label="Gross margin"
                          value={`${revenue ? (((revenue - soldCost + returnedCost) / revenue) * 100).toFixed(1) : "0"}%`}
                        />
                        <Metric
                          label="Inventory value · cost"
                          value={money(
                            inventory.reduce(
                              (s, i) =>
                                s +
                                i.quantity *
                                  ((t.product_costs ?? []).find(
                                    (c) => c.product_id === i.product_id,
                                  )?.cost_sen ?? 0),
                              0,
                            ),
                          )}
                        />
                      </>
                    )}
                    <Metric
                      label="Refunds · incl. tax"
                      value={money(
                        dateRefunds.reduce((s, r) => s + r.total_sen, 0),
                      )}
                    />
                    <Metric
                      label="Discounts"
                      value={money(
                        dateSales.reduce((s, r) => s + r.discount_sen, 0),
                      )}
                    />
                  </div>
                  <section className="panel">
                    <h2>Best-selling products</h2>
                    <p>
                      Units sold in the selected period; refunds shown
                      separately in totals.
                    </p>
                    {rankedProducts.map((p) => {
                      const n = items
                        .filter(
                          (i) =>
                            i.product_id === p.id &&
                            dateSales.some((s) => s.id === i.sale_id),
                        )
                        .reduce((s, i) => s + i.quantity, 0);
                      return (
                        <div className="performance" key={p.id}>
                          <span>
                            {p.name}
                            <small>{p.sku}</small>
                          </span>
                          <div className="bar">
                            <i style={{ width: `${Math.min(100, n * 5)}%` }} />
                          </div>
                          <strong>{n}</strong>
                        </div>
                      );
                    })}
                  </section>
                  <section className="panel">
                    <h2>Slow-moving products</h2>
                    <p>
                      Lowest units sold in the selected period, including
                      products with no sales.
                    </p>
                    {[...rankedProducts]
                      .reverse()
                      .slice(0, 5)
                      .map((p) => (
                        <div className="summary-row" key={p.id}>
                          <span>
                            {p.sku} · {p.name}
                          </span>
                          <strong>{unitsSold(p.id)} units</strong>
                        </div>
                      ))}
                  </section>
                  <section className="panel">
                    <h2>Payments by method</h2>
                    {methods.map((m) => (
                      <div className="summary-row" key={m.value}>
                        <span>{m.label}</span>
                        <strong>
                          {money(
                            payments
                              .filter(
                                (p) =>
                                  p.method === m.value &&
                                  dateSales.some((s) => s.id === p.sale_id),
                              )
                              .reduce((s, p) => s + p.amount_sen, 0),
                          )}
                        </strong>
                      </div>
                    ))}
                  </section>
                </>
              )}
              {["Dashboard", "Reports"].includes(page) && (
                <>
                  <section className="panel">
                    <h2>Daily sales · including tax</h2>
                    {Array.from(
                      new Set(
                        dateSales.map((s) =>
                          new Intl.DateTimeFormat("en-CA", {
                            timeZone: "Asia/Kuala_Lumpur",
                          }).format(new Date(s.created_at)),
                        ),
                      ),
                    )
                      .sort()
                      .map((day) => {
                        const amount = dateSales
                          .filter(
                            (s) =>
                              new Intl.DateTimeFormat("en-CA", {
                                timeZone: "Asia/Kuala_Lumpur",
                              }).format(new Date(s.created_at)) === day,
                          )
                          .reduce((sum, s) => sum + s.total_sen, 0);
                        const max = Math.max(
                          1,
                          ...dateSales.map((s) => s.total_sen),
                        );
                        return (
                          <div className="performance" key={day}>
                            <span>{day}</span>
                            <div className="bar">
                              <i
                                style={{
                                  width: `${Math.min(100, (amount / max) * 100)}%`,
                                }}
                              />
                            </div>
                            <strong>{money(amount)}</strong>
                          </div>
                        );
                      })}
                    {!dateSales.length && <p>No sales in this date range.</p>}
                  </section>
                  <section className="panel">
                    <h2>Sales by cashier · including tax</h2>
                    {Array.from(
                      new Set(dateSales.map((s) => s.cashier_id)),
                    ).map((id) => (
                      <div className="summary-row" key={id}>
                        <span>
                          {
                            dateSales.find((s) => s.cashier_id === id)
                              ?.cashier_name
                          }
                        </span>
                        <strong>
                          {money(
                            dateSales
                              .filter((s) => s.cashier_id === id)
                              .reduce((sum, s) => sum + s.total_sen, 0),
                          )}
                        </strong>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <h2>Sales by category · before order discounts and tax</h2>
                    {(t.product_categories ?? []).map((c) => (
                      <div className="summary-row" key={c.id}>
                        <span>{c.name}</span>
                        <strong>
                          {money(
                            items
                              .filter(
                                (i) =>
                                  dateSales.some((s) => s.id === i.sale_id) &&
                                  i.category_name === c.name,
                              )
                              .reduce((sum, i) => sum + i.total_sen, 0),
                          )}
                        </strong>
                      </div>
                    ))}
                    <div className="summary-row">
                      <span>Delivery / services</span>
                      <strong>
                        {money(
                          items
                            .filter(
                              (i) =>
                                i.product_id === null &&
                                dateSales.some((s) => s.id === i.sale_id),
                            )
                            .reduce((sum, i) => sum + i.total_sen, 0),
                        )}
                      </strong>
                    </div>
                  </section>
                  {role === "owner" && (
                    <section className="panel">
                      <h2>
                        Product profitability · before order discounts, tax and
                        refunds
                      </h2>
                      <Table
                        heads={[
                          "Product",
                          "Sales",
                          "Historical cost",
                          "Gross profit",
                        ]}
                        rows={products.map((p) => {
                          const sold = items.filter(
                            (i) =>
                              i.product_id === p.id &&
                              dateSales.some((s) => s.id === i.sale_id),
                          );
                          const revenue = sold.reduce(
                              (sum, i) => sum + i.total_sen,
                              0,
                            ),
                            cost = sold.reduce(
                              (sum, i) =>
                                sum +
                                i.quantity *
                                  ((t.sale_item_costs ?? []).find(
                                    (c) => c.sale_item_id === i.id,
                                  )?.cost_sen ?? 0),
                              0,
                            );
                          return [
                            p.name,
                            money(revenue),
                            money(cost),
                            money(revenue - cost),
                          ];
                        })}
                      />
                    </section>
                  )}
                </>
              )}
              {page === "Products" && (
                <>
                  <div className="toolbar">
                    <p>{products.length} products in your collection</p>
                    {role === "owner" && (
                      <button
                        className="primary"
                        onClick={() =>
                          form("Add a product", "product", productFields())
                        }
                      >
                        <Plus size={16} />
                        Add product
                      </button>
                    )}
                  </div>
                  <Table
                    heads={[
                      "SKU",
                      "Product",
                      "Price",
                      "Available",
                      "Status",
                      "",
                    ]}
                    rows={products.map((p) => [
                      p.sku,
                      p.name,
                      money(p.price_sen),
                      stock(p.id),
                      p.archived ? "Archived" : "Active",
                      role === "owner" ? (
                        <button
                          key={p.id}
                          className="text-button"
                          onClick={() =>
                            form("Edit product", "product", productFields(p), {
                              id: p.id,
                            })
                          }
                        >
                          Edit
                        </button>
                      ) : null,
                    ])}
                  />
                </>
              )}
              {page === "Inventory" && (
                <>
                  <div className="toolbar">
                    <p>
                      All adjustments are audited. Negative stock is prevented.
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        form("Adjust inventory", "adjust_stock", [
                          {
                            name: "product_id",
                            label: "Product",
                            type: "select",
                            options: productOptions,
                            required: true,
                          },
                          {
                            name: "quantity",
                            label: "Quantity change (negative for stock out)",
                            type: "number",
                            required: true,
                          },
                          {
                            name: "type",
                            label: "Reason type",
                            type: "select",
                            options: [
                              "stock-in",
                              "stock-out",
                              "damaged",
                              "expired",
                              "adjustment",
                            ].map((x) => ({ value: x, label: x })),
                          },
                          {
                            name: "reason",
                            label: "Reason / notes",
                            required: true,
                          },
                          { name: "batch", label: "Batch (optional)" },
                          {
                            name: "expires_on",
                            label: "Expiry (optional)",
                            type: "date",
                          },
                        ])
                      }
                    >
                      <Plus size={16} />
                      Adjust stock
                    </button>
                  </div>
                  <Table
                    heads={[
                      "SKU",
                      "Product",
                      "Recorded stock",
                      "Reserved online",
                      "Available",
                      "Threshold",
                      "Status",
                    ]}
                    rows={products.map((p) => [
                      p.sku,
                      p.name,
                      inventory.find((i) => i.product_id === p.id)?.quantity ??
                        0,
                      inventory.find((i) => i.product_id === p.id)?.reserved ??
                        0,
                      stock(p.id),
                      p.low_stock,
                      stock(p.id) <= p.low_stock ? "Low stock" : "Healthy",
                    ])}
                  />
                  <h2>Movement history</h2>
                  <Table
                    heads={["Date", "Product", "Quantity", "Type", "Reason"]}
                    rows={(t.stock_movements ?? []).map((m) => [
                      localDate(m.created_at),
                      products.find((p) => p.id === m.product_id)?.sku,
                      m.quantity,
                      m.movement_type,
                      m.reason,
                    ])}
                  />
                </>
              )}
              {page === "Purchase Orders" && (
                <>
                  <div className="toolbar">
                    <p>Receiving an order adds stock exactly once.</p>
                    <button
                      className="primary"
                      onClick={() =>
                        form("Create purchase order", "purchase_order", [
                          {
                            name: "supplier_id",
                            label: "Supplier",
                            type: "select",
                            required: true,
                            options: (t.suppliers ?? []).map((s) => ({
                              value: s.id,
                              label: s.name,
                            })),
                          },
                          {
                            name: "product_id",
                            label: "Product",
                            type: "select",
                            required: true,
                            options: productOptions,
                          },
                          {
                            name: "quantity",
                            label: "Quantity",
                            type: "number",
                            required: true,
                          },
                          {
                            name: "cost_sen",
                            label: "Unit cost (RM)",
                            type: "number",
                            required: true,
                          },
                        ])
                      }
                    >
                      <Plus size={16} />
                      New order
                    </button>
                  </div>
                  <Table
                    heads={["Date", "Supplier", "Status", ""]}
                    rows={(t.purchase_orders ?? []).map((p) => [
                      localDate(p.created_at),
                      (t.suppliers ?? []).find((s) => s.id === p.supplier_id)
                        ?.name,
                      p.status,
                      p.status === "ordered" ? (
                        <button
                          className="text-button"
                          key={p.id}
                          disabled={busy}
                          onClick={() =>
                            void act("receive_order", { id: p.id }).catch(
                              () => {},
                            )
                          }
                        >
                          Receive goods
                        </button>
                      ) : null,
                    ])}
                  />
                </>
              )}
              {["Customers", "Suppliers"].includes(page) && (
                <>
                  <div className="toolbar">
                    <div className="search-box">
                      <Search size={17} />
                      <input
                        placeholder="Search name or phone"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <button
                      className="primary"
                      onClick={() =>
                        form(
                          `New ${page === "Customers" ? "customer" : "supplier"}`,
                          page === "Customers" ? "customer" : "supplier",
                          [
                            { name: "name", label: "Name", required: true },
                            { name: "phone", label: "Phone" },
                            { name: "email", label: "Email", type: "email" },
                            { name: "notes", label: "Notes" },
                            ...(page === "Customers"
                              ? [
                                  {
                                    name: "marketing_consent",
                                    label:
                                      "Customer explicitly consents to marketing",
                                    type: "checkbox",
                                  },
                                ]
                              : []),
                          ],
                        )
                      }
                    >
                      <Plus size={16} />
                      Add {page === "Customers" ? "customer" : "supplier"}
                    </button>
                  </div>
                  <Table
                    heads={[
                      "Name",
                      "Phone",
                      "Email",
                      ...(page === "Customers"
                        ? ["Lifetime spend", "Membership"]
                        : ["Notes"]),
                      ...(privileged ? ["Edit"] : []),
                      ...(page === "Customers" ? ["Purchases"] : []),
                    ]}
                    rows={(
                      t[page === "Customers" ? "customers" : "suppliers"] ?? []
                    )
                      .filter((c) =>
                        `${c.name} ${c.phone}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((c) => [
                        c.name,
                        c.phone,
                        c.email,
                        ...(page === "Customers"
                          ? [
                              money(
                                sales
                                  .filter((s) => s.customer_id === c.id)
                                  .reduce(
                                    (a, s) =>
                                      a +
                                      s.total_sen -
                                      refunds
                                        .filter((r) => r.sale_id === s.id)
                                        .reduce((a, r) => a + r.total_sen, 0),
                                    0,
                                  ),
                              ),
                              c.membership_tier,
                            ]
                          : [c.notes]),
                        ...(privileged
                          ? [
                              <button
                                className="text-button"
                                key={c.id}
                                onClick={() =>
                                  form(
                                    `Edit ${page === "Customers" ? "customer" : "supplier"}`,
                                    page === "Customers"
                                      ? "customer"
                                      : "supplier",
                                    [
                                      {
                                        name: "name",
                                        label: "Name",
                                        value: c.name,
                                        required: true,
                                      },
                                      {
                                        name: "phone",
                                        label: "Phone",
                                        value: c.phone ?? "",
                                      },
                                      {
                                        name: "email",
                                        label: "Email",
                                        value: c.email ?? "",
                                        type: "email",
                                      },
                                      {
                                        name: "notes",
                                        label: "Notes",
                                        value: c.notes ?? "",
                                      },
                                      ...(page === "Customers"
                                        ? [
                                            {
                                              name: "membership_tier",
                                              label: "Membership tier",
                                              value: c.membership_tier,
                                            },
                                            {
                                              name: "loyalty_points",
                                              label: "Loyalty points",
                                              type: "number",
                                              value: c.loyalty_points,
                                            },
                                            {
                                              name: "marketing_consent",
                                              label:
                                                "Explicit marketing consent",
                                              type: "checkbox",
                                              value: c.marketing_consent,
                                            },
                                          ]
                                        : []),
                                    ],
                                    { id: c.id },
                                  )
                                }
                              >
                                Edit
                              </button>,
                            ]
                          : []),
                        ...(page === "Customers"
                          ? [
                              <button
                                className="text-button"
                                key={`history-${c.id}`}
                                onClick={() => {
                                  setHistoryCustomer(c.id);
                                  setPage("Sales History");
                                }}
                              >
                                View purchases
                              </button>,
                            ]
                          : []),
                      ])}
                  />
                </>
              )}
              {page === "Sales History" && (
                <>
                  <div className="toolbar">
                    <p>{sales.length} recorded transactions</p>
                    <select
                      aria-label="Sales customer filter"
                      value={historyCustomer}
                      onChange={(e) => setHistoryCustomer(e.target.value)}
                      style={{ maxWidth: 220 }}
                    >
                      <option value="">All customers</option>
                      {(t.customers ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button className="secondary" onClick={exportSales}>
                      <Download size={16} />
                      Export
                    </button>
                  </div>
                  <Table
                    heads={[
                      "Receipt",
                      "Malaysia date",
                      "Total",
                      "Refunded",
                      "",
                    ]}
                    rows={[...sales]
                      .filter(
                        (s) =>
                          !historyCustomer || s.customer_id === historyCustomer,
                      )
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((s) => [
                        s.receipt_number,
                        localDate(s.created_at),
                        money(s.total_sen),
                        money(
                          refunds
                            .filter((r) => r.sale_id === s.id)
                            .reduce((sum, r) => sum + r.total_sen, 0),
                        ),
                        <button
                          key={s.id}
                          className="text-button"
                          onClick={() => setReceipt(s.id)}
                        >
                          View receipt
                        </button>,
                      ])}
                  />
                </>
              )}
              {page === "Refunds" && (
                <>
                  <div className="toolbar">
                    <button
                      className="secondary"
                      onClick={() =>
                        form("Void transaction", "void_sale", [
                          {
                            name: "sale_id",
                            label: "Sale",
                            type: "select",
                            required: true,
                            options: sales
                              .filter(
                                (s) =>
                                  !(t.sale_voids ?? []).some(
                                    (v) => v.sale_id === s.id,
                                  ),
                              )
                              .map((s) => ({
                                value: s.id,
                                label: s.receipt_number,
                              })),
                          },
                          { name: "reason", label: "Reason", required: true },
                          {
                            name: "method",
                            label: "Refund method",
                            type: "select",
                            options: methods,
                          },
                          {
                            name: "restock",
                            label: "All remaining returned items are sellable",
                            type: "checkbox",
                          },
                        ])
                      }
                    >
                      Void transaction
                    </button>
                    <p>
                      Choose sellable restock only after inspecting returned
                      goods.
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        form(
                          "Refund an item",
                          "refund",
                          [
                            {
                              name: "sale_item_id",
                              label: "Sale item",
                              type: "select",
                              required: true,
                              options: items.map((i) => ({
                                value: i.id,
                                label: `${sales.find((s) => s.id === i.sale_id)?.receipt_number} · ${i.sku} · ${i.quantity} sold`,
                              })),
                            },
                            {
                              name: "quantity",
                              label: "Quantity",
                              type: "number",
                              required: true,
                            },
                            { name: "reason", label: "Reason", required: true },
                            {
                              name: "method",
                              label: "Refund payment method",
                              type: "select",
                              options: methods,
                            },
                            {
                              name: "restock",
                              label:
                                "Inspected and sellable: return to inventory",
                              type: "checkbox",
                            },
                          ],
                          { key: crypto.randomUUID() },
                        )
                      }
                    >
                      <RotateCcw size={16} />
                      New refund
                    </button>
                  </div>
                  <Table
                    heads={["Receipt", "Date", "Amount", "Method", "Reason"]}
                    rows={refunds.map((r) => [
                      sales.find((s) => s.id === r.sale_id)?.receipt_number,
                      localDate(r.created_at),
                      money(r.total_sen),
                      r.method,
                      r.reason,
                    ])}
                  />
                </>
              )}
              {page === "Cashier Closing" && (
                <>
                  <div className="toolbar">
                    <p>
                      {session
                        ? "Your cashier session is open."
                        : "Start a session before accepting payments."}
                    </p>
                    {!session ? (
                      <button
                        className="primary"
                        onClick={() =>
                          form("Open cashier session", "open_session", [
                            {
                              name: "opening_sen",
                              label: "Opening cash float (RM)",
                              type: "number",
                              value: 0,
                              required: true,
                            },
                          ])
                        }
                      >
                        Open session
                      </button>
                    ) : (
                      <button
                        className="primary"
                        onClick={() =>
                          form(
                            "Count and close session",
                            "close_session",
                            [
                              {
                                name: "actual_sen",
                                label: "Actual counted cash (RM)",
                                type: "number",
                                required: true,
                              },
                            ],
                            { id: session.id },
                          )
                        }
                      >
                        Close session
                      </button>
                    )}
                    {privileged && session && (
                      <button
                        className="secondary"
                        onClick={() =>
                          form(
                            "Cash in / out",
                            "cash_movement",
                            [
                              {
                                name: "amount_sen",
                                label: "Amount (RM; negative for cash out)",
                                type: "number",
                                required: true,
                              },
                              {
                                name: "reason",
                                label: "Reason",
                                required: true,
                              },
                            ],
                            { session_id: session.id },
                          )
                        }
                      >
                        Cash movement
                      </button>
                    )}
                  </div>
                  <Table
                    heads={[
                      "Started",
                      "Cashier",
                      "Opening",
                      "Expected",
                      "Counted",
                      "Difference",
                      "Status",
                      "",
                    ]}
                    rows={(t.cashier_sessions ?? []).map((s) => [
                      localDate(s.started_at),
                      (t.profiles ?? []).find((p) => p.id === s.cashier_id)
                        ?.display_name ?? s.cashier_id,
                      money(s.opening_sen),
                      s.expected_sen === null ? "—" : money(s.expected_sen),
                      s.actual_sen === null ? "—" : money(s.actual_sen),
                      s.difference_sen === null ? "—" : money(s.difference_sen),
                      s.status,
                      privileged &&
                      s.status === "submitted" &&
                      s.cashier_id !== data.profile.id ? (
                        <button
                          key={s.id}
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void act("approve_session", { id: s.id }).catch(
                              () => {},
                            )
                          }
                        >
                          Approve
                        </button>
                      ) : null,
                    ])}
                  />
                </>
              )}
              {page === "Staff Management" && (
                <>
                  <div className="toolbar">
                    <p>
                      Create or invite the Auth user in Supabase first. Public
                      signup grants no staff access.
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        form("Provision staff", "staff", [
                          {
                            name: "id",
                            label: "Supabase Auth user UUID",
                            required: true,
                          },
                          {
                            name: "display_name",
                            label: "Display name",
                            required: true,
                          },
                          {
                            name: "role",
                            label: "Role",
                            type: "select",
                            options: ["cashier", "manager", "owner"].map(
                              (x) => ({ value: x, label: x }),
                            ),
                          },
                          {
                            name: "active",
                            label: "Active",
                            type: "checkbox",
                            value: true,
                          },
                        ])
                      }
                    >
                      <Plus size={16} />
                      Add staff
                    </button>
                  </div>
                  <Table
                    heads={["Name", "Role", "Active", ""]}
                    rows={(t.profiles ?? []).map((p) => [
                      p.display_name,
                      p.role,
                      p.active ? "Yes" : "No",
                      p.id !== data.profile.id ? (
                        <button
                          key={p.id}
                          className="text-button"
                          onClick={() =>
                            form(
                              "Edit staff",
                              "staff",
                              [
                                {
                                  name: "display_name",
                                  label: "Name",
                                  value: p.display_name,
                                  required: true,
                                },
                                {
                                  name: "role",
                                  label: "Role",
                                  type: "select",
                                  value: p.role,
                                  options: ["cashier", "manager", "owner"].map(
                                    (x) => ({ value: x, label: x }),
                                  ),
                                },
                                {
                                  name: "active",
                                  label: "Active",
                                  type: "checkbox",
                                  value: p.active,
                                },
                              ],
                              { id: p.id },
                            )
                          }
                        >
                          Edit
                        </button>
                      ) : null,
                    ])}
                  />
                </>
              )}
              {page === "Settings" && (
                <>
                  <section className="panel">
                    <h2>Business identity</h2>
                    <p>
                      CHIPSTI ENTERPRISE
                      <br />
                      SSM: 202603232290 (RA0139100-V)
                      <br />
                      MYR · Asia/Kuala_Lumpur
                    </p>
                    <button
                      className="secondary"
                      onClick={() =>
                        form("Checkout settings", "settings", [
                          {
                            name: "tax_bps",
                            label: "Tax (%)",
                            type: "number",
                            value: t.system_settings?.[0]?.tax_bps ?? 0,
                            required: true,
                          },
                          {
                            name: "cashier_discount_bps",
                            label: "Maximum cashier discount (%)",
                            type: "number",
                            value:
                              t.system_settings?.[0]?.cashier_discount_bps ?? 0,
                            required: true,
                          },
                        ])
                      }
                    >
                      Edit tax & discount limits
                    </button>
                  </section>
                  <section className="panel">
                    <h2>Collection settings</h2>
                    <div className="toolbar">
                      <button
                        className="secondary"
                        onClick={() =>
                          form("Add category", "category", [
                            {
                              name: "name",
                              label: "Category name",
                              required: true,
                            },
                          ])
                        }
                      >
                        Add category
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          form("New promotion", "promotion", [
                            {
                              name: "name",
                              label: "Promotion name",
                              required: true,
                            },
                            {
                              name: "percent_bps",
                              label: "Discount (%)",
                              type: "number",
                              required: true,
                            },
                            {
                              name: "starts_at",
                              label: "Starts (Malaysia time)",
                              type: "datetime-local",
                              required: true,
                            },
                            {
                              name: "ends_at",
                              label: "Ends (Malaysia time)",
                              type: "datetime-local",
                              required: true,
                            },
                          ])
                        }
                      >
                        Add promotion
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Promotions</h2>
                    {(t.promotions ?? []).map((p) => (
                      <div className="summary-row" key={p.id}>
                        <span>
                          {p.name} · {p.percent_bps / 100}% ·{" "}
                          {p.active ? "Enabled" : "Disabled"}
                        </span>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void act("promotion_toggle", {
                              id: p.id,
                              active: !p.active,
                            }).catch(() => {})
                          }
                        >
                          {p.active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    ))}
                  </section>
                  <h2>Audit trail</h2>
                  <Table
                    heads={["Date", "Action", "Staff", "Reference"]}
                    rows={(t.audit_logs ?? []).map((a) => [
                      localDate(a.created_at),
                      a.action,
                      a.staff_id,
                      a.entity_id,
                    ])}
                  />
                </>
              )}
            </>
          )}
          {(t.held_orders ?? []).length > 0 && page === "Point of Sale" && (
            <section className="held">
              <h3>Held orders</h3>
              {t.held_orders.map((h) => (
                <button
                  className="secondary"
                  key={h.id}
                  disabled={cart.length > 0 || busy}
                  onClick={async () => {
                    try {
                      const saved = h.cart as CartLine[];
                      await act("delete_hold", { id: h.id });
                      setCart(saved);
                      checkoutKey.current = "";
                    } catch {}
                  }}
                >
                  Resume {h.label}
                  <ArrowRight size={14} />
                </button>
              ))}
              {cart.length > 0 && (
                <small>Clear or hold the current cart before resuming.</small>
              )}
            </section>
          )}
          {page === "Online Orders" && privileged && (
            <OnlineOrders data={data} refresh={refresh} />
          )}
          <footer>
            <BrandLogo className="footer-logo" /> CHIPSTI ENTERPRISE{" "}
            <span>SSM 202603232290 (RA0139100-V)</span>
          </footer>
        </div>
      </div>
      {modal && (
        <div className="overlay">
          <section className="modal">
            <div className="modal-heading">
              <h2>{modal.title}</h2>
              <button
                className="icon-btn"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const payload: Record<string, unknown> = { ...modal.extra };
                try {
                  for (const field of modal.fields) {
                    const v = formData.get(field.name);
                    if (field.type === "checkbox")
                      payload[field.name] = v === "on";
                    else if (field.type === "number")
                      payload[field.name] =
                        field.name.endsWith("_sen") ||
                        field.name.endsWith("_bps")
                          ? parseAmount(String(v))
                          : Number(v);
                    else if (field.type === "datetime-local")
                      payload[field.name] = new Date(
                        `${v}:00+08:00`,
                      ).toISOString();
                    else if (v !== "") payload[field.name] = v;
                  }
                  if (modal.action === "refund")
                    payload.sale_id = items.find(
                      (i) => i.id === payload.sale_item_id,
                    )?.sale_id;
                  await act(modal.action, payload);
                  if (modal.action === "hold") {
                    setCart([]);
                    checkoutKey.current = "";
                  }
                  setModal(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to save");
                }
              }}
            >
              {modal.fields.map((field) => (
                <label
                  key={field.name}
                  className={field.type === "checkbox" ? "checkbox-label" : ""}
                >
                  {field.type === "checkbox" ? (
                    <>
                      <input
                        type="checkbox"
                        name={field.name}
                        defaultChecked={Boolean(field.value)}
                      />
                      {field.label}
                    </>
                  ) : (
                    <>
                      {field.label}
                      {field.type === "select" ? (
                        <select
                          name={field.name}
                          defaultValue={String(field.value ?? "")}
                          required={field.required}
                        >
                          <option value="">Select…</option>
                          {field.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          name={field.name}
                          type={field.type ?? "text"}
                          step={
                            field.name.endsWith("_sen") ||
                            field.name.endsWith("_bps")
                              ? "0.01"
                              : undefined
                          }
                          defaultValue={String(
                            field.value === undefined
                              ? ""
                              : field.name.endsWith("_sen") ||
                                  field.name.endsWith("_bps")
                                ? Number(field.value) / 100
                                : field.value,
                          )}
                          required={field.required}
                        />
                      )}
                    </>
                  )}
                </label>
              ))}
              {modal.action === "product" && (
                <label className="upload">
                  <Upload size={16} />
                  Upload product image (max 5 MB)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const input = e.currentTarget.form?.elements.namedItem(
                        "image_url",
                      ) as HTMLInputElement;
                      try {
                        if (file.size > 5242880)
                          throw new Error("Maximum image size is 5 MB");
                        const db = createBrowserClient(
                          process.env.NEXT_PUBLIC_SUPABASE_URL!,
                          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
                        );
                        const path = `${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                        const { error } = await db.storage
                          .from("product-images")
                          .upload(path, file);
                        if (error) throw error;
                        input.value = db.storage
                          .from("product-images")
                          .getPublicUrl(path).data.publicUrl;
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Upload failed",
                        );
                      }
                    }}
                  />
                </label>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
                <Check size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
      {paymentOpen && (
        <div className="overlay">
          <section className="modal payment-modal">
            <div className="modal-heading">
              <h2>Complete payment</h2>
              <button
                className="icon-btn"
                onClick={() => setPaymentOpen(false)}
                aria-label="Close payment"
              >
                <X />
              </button>
            </div>
            <div className="payment-total">{money(total)}</div>
            <p>
              Non-cash payments are manually confirmed by the cashier. Verify
              receipt of funds before completing.
            </p>
            <label>
              Payment method
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {methods.map((m) => (
                  <option value={m.value} key={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {paymentMethod === "cash"
                ? "Cash received (RM)"
                : "Payment amount (RM)"}
              <input
                type="number"
                min="0"
                step="0.01"
                value={Number(tendered) / 100}
                onChange={(e) =>
                  setTendered(String(Math.round(Number(e.target.value) * 100)))
                }
              />
            </label>
            {paymentMethod !== "cash" && (
              <label>
                Payment reference
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                />
              </label>
            )}
            <div className="summary-row">
              <span>Remaining</span>
              <strong>
                {money(
                  total - extraPayments.reduce((s, p) => s + p.amount_sen, 0),
                )}
              </strong>
            </div>
            {paymentMethod === "cash" && (
              <div className="summary-row">
                <span>Change</span>
                <strong>
                  {money(
                    Math.max(
                      0,
                      Number(tendered) -
                        (total -
                          extraPayments.reduce((s, p) => s + p.amount_sen, 0)),
                    ),
                  )}
                </strong>
              </div>
            )}
            <details>
              <summary>Mixed payment</summary>
              <label>
                Amount to allocate to this method (RM)
                <input
                  type="number"
                  step="0.01"
                  value={Number(splitAmount) / 100}
                  onChange={(e) =>
                    setSplitAmount(
                      String(Math.round(Number(e.target.value) * 100)),
                    )
                  }
                />
              </label>
              <button
                className="secondary"
                onClick={() => {
                  const n = Number(splitAmount);
                  if (
                    !Number.isSafeInteger(n) ||
                    n <= 0 ||
                    n >=
                      total -
                        extraPayments.reduce((s, p) => s + p.amount_sen, 0) ||
                    Number(tendered) < n ||
                    (paymentMethod !== "cash" && !reference)
                  ) {
                    setError(
                      "Enter a valid partial amount and payment reference",
                    );
                    return;
                  }
                  setExtraPayments((p) => [
                    ...p,
                    {
                      method: paymentMethod,
                      amount_sen: n,
                      tendered_sen:
                        paymentMethod === "cash" ? Number(tendered) : n,
                      reference,
                    },
                  ]);
                  setTendered(
                    String(
                      total -
                        extraPayments.reduce((s, p) => s + p.amount_sen, 0) -
                        n,
                    ),
                  );
                  setReference("");
                  checkoutKey.current = "";
                }}
              >
                Add payment portion
              </button>
              {extraPayments.map((p, i) => (
                <p key={i}>
                  {p.method} · {money(p.amount_sen)}
                </p>
              ))}
            </details>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                const remaining =
                  total - extraPayments.reduce((s, p) => s + p.amount_sen, 0);
                if (
                  Number(tendered) < remaining ||
                  (paymentMethod !== "cash" &&
                    (!reference || Number(tendered) !== remaining))
                ) {
                  setError(
                    "Confirm sufficient funds and enter a reference for non-cash payment",
                  );
                  return;
                }
                checkoutKey.current ||= crypto.randomUUID();
                try {
                  const id = await act("checkout", {
                    key: checkoutKey.current,
                    items: cart,
                    customer_id: customer || undefined,
                    discount_kind: discountKind,
                    discount_value: discountValue,
                    promotion_id: promotion || undefined,
                    payments:
                      total === 0
                        ? []
                        : [
                            ...extraPayments,
                            {
                              method: paymentMethod,
                              amount_sen: remaining,
                              tendered_sen: Number(tendered),
                              reference,
                            },
                          ],
                  });
                  setReceipt(id);
                  setCart([]);
                  setDiscountValue(0);
                  setPromotion("");
                  setPaymentOpen(false);
                  checkoutKey.current = "";
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to save");
                }
              }}
            >
              {busy ? "Completing…" : "Confirm payment"}
              <Check size={18} />
            </button>
          </section>
        </div>
      )}
      {selectedSale && (
        <div className="overlay receipt-overlay">
          <section className="modal receipt-modal">
            <div className="receipt-actions">
              <select
                aria-label="Receipt paper size"
                onChange={(e) =>
                  document.documentElement.style.setProperty(
                    "--receipt-width",
                    e.target.value,
                  )
                }
                defaultValue="80mm"
              >
                <option value="80mm">80 mm</option>
                <option value="58mm">58 mm</option>
                <option value="180mm">A4 / PDF</option>
              </select>
              <button
                className="icon-btn"
                aria-label="Print receipt"
                onClick={() => window.print()}
              >
                <Printer />
              </button>
              <button
                className="icon-btn"
                aria-label="Close receipt"
                onClick={() => setReceipt("")}
              >
                <X />
              </button>
            </div>
            <article className="receipt" ref={receiptRef}>
              <BrandLogo className="receipt-logo" />
              <h2>CHIPSTI ENTERPRISE</h2>
              <p>SSM: 202603232290 (RA0139100-V)</p>
              <hr />
              <strong>{selectedSale.receipt_number}</strong>
              <p>
                {localDate(selectedSale.created_at)}
                <br />
                Cashier: {selectedSale.cashier_name}
              </p>
              {selectedSale.customer_id && (
                <p>
                  Customer:{" "}
                  {
                    (t.customers ?? []).find(
                      (c) => c.id === selectedSale.customer_id,
                    )?.name
                  }
                </p>
              )}
              <hr />
              {items
                .filter((i) => i.sale_id === selectedSale.id)
                .map((i) => (
                  <div key={i.id}>
                    <strong>{i.name}</strong>
                    <div className="summary-row">
                      <span>
                        {i.sku} · {i.quantity} × {money(i.unit_price_sen)}
                      </span>
                      <span>{money(i.total_sen)}</span>
                    </div>
                    {i.discount_sen > 0 && (
                      <small>Item discount: {money(i.discount_sen)}</small>
                    )}
                  </div>
                ))}
              <hr />
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{money(selectedSale.subtotal_sen)}</span>
              </div>
              <div className="summary-row">
                <span>Total discounts</span>
                <span>−{money(selectedSale.discount_sen)}</span>
              </div>
              <div className="summary-row">
                <span>Tax</span>
                <span>{money(selectedSale.tax_sen)}</span>
              </div>
              <div className="total-row">
                <strong>Total MYR</strong>
                <strong>{money(selectedSale.total_sen)}</strong>
              </div>
              {payments
                .filter((p) => p.sale_id === selectedSale.id)
                .map((p) => (
                  <div key={p.id}>
                    <div className="summary-row">
                      <span>
                        {methods.find((m) => m.value === p.method)?.label}
                      </span>
                      <span>{money(p.amount_sen)}</span>
                    </div>
                    <small>
                      Received {money(p.tendered_sen)} · Change{" "}
                      {money(p.tendered_sen - p.amount_sen)}
                      <br />
                      {p.reference && `Ref: ${p.reference} · `}Cashier confirmed
                    </small>
                  </div>
                ))}
              <hr />
              <SaleReceiptPaymentDetails
                key={selectedSale.id}
                saleId={selectedSale.id}
              />
              <p className="thank-you">
                Thank you for shopping with us.
                <br />A little more extraordinary.
              </p>
            </article>
            <ReceiptPdfActions
              key={selectedSale.id}
              getReceipt={() => receiptRef.current}
              name={selectedSale.receipt_number}
              layout="pos"
            />
            <a
              className="secondary share"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(
                `CHIPSTI ENTERPRISE\nSSM: 202603232290 (RA0139100-V)\n${selectedSale.receipt_number}\n${localDate(selectedSale.created_at)}\n${items
                  .filter((i) => i.sale_id === selectedSale.id)
                  .map(
                    (i) =>
                      `${i.sku} ${i.name} ×${i.quantity} ${money(i.total_sen)}`,
                  )
                  .join(
                    "\n",
                  )}\nDiscounts: ${money(selectedSale.discount_sen)}\nTax: ${money(selectedSale.tax_sen)}\nTotal: ${money(selectedSale.total_sen)}\nThank you!`,
              )}`}
            >
              Share receipt on WhatsApp
              <ArrowRight size={16} />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>From recorded store activity</span>
    </div>
  );
}
function Table({
  heads,
  rows,
}: {
  heads: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty">
          <Package size={28} />
          <h3>Nothing here yet.</h3>
          <p>Your records will appear here.</p>
        </div>
      )}
    </div>
  );
}
