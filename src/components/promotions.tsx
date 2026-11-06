"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Copy, Tag, X } from "lucide-react";
import { money, parseAmount } from "@/lib/money";
import {
  malaysiaDateTimeInput,
  malaysiaInputToUtc,
  type Offer,
  type PromotionDashboard,
} from "@/lib/promotions";
import type { AppData } from "@/lib/data";
type Draft = {
  id?: string;
  expected_version?: number;
  name: string;
  code: string;
  discount_type: "percent" | "fixed";
  value: string;
  starts: string;
  ends: string;
  minimum: string;
  cap: string;
  limit: string;
  eligible_product_ids: string[];
  eligible_category_ids: string[];
  excluded_product_ids: string[];
  excluded_category_ids: string[];
  allow_manual_stacking: boolean;
  publication_status?: string;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
const label = (p: Offer) =>
  p.discount_type === "percent"
    ? `${p.percent_bps / 100}%`
    : money(p.fixed_discount_sen);
function draftFor(p: Offer): Draft {
  return {
    id: p.id,
    expected_version: p.version,
    name: p.name,
    code: p.code,
    discount_type: p.discount_type,
    value: String(
      p.discount_type === "percent"
        ? p.percent_bps / 100
        : p.fixed_discount_sen / 100,
    ),
    starts: malaysiaDateTimeInput(p.starts_at),
    ends: malaysiaDateTimeInput(p.ends_at),
    minimum: String(p.minimum_spend_sen / 100),
    cap: p.discount_cap_sen === null ? "" : String(p.discount_cap_sen / 100),
    limit: p.max_redemptions === null ? "" : String(p.max_redemptions),
    eligible_product_ids: p.eligible_product_ids,
    eligible_category_ids: p.eligible_category_ids,
    excluded_product_ids: p.excluded_product_ids,
    excluded_category_ids: p.excluded_category_ids,
    allow_manual_stacking: p.allow_manual_stacking,
    publication_status: p.publication_status,
  };
}
export default function Promotions({ data }: { data: AppData }) {
  const [dashboard, setDashboard] = useState<PromotionDashboard | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState(""),
    [simCode, setSimCode] = useState("CGSVIP20"),
    [simAt, setSimAt] = useState(""),
    [simManual, setSimManual] = useState("0"),
    [simulation, setSimulation] = useState<{
      discount_sen: number;
      product_subtotal_sen: number;
      subtotal_after_discount_sen: number;
      at: string;
    } | null>(null),
    [simItems, setSimItems] = useState([
      { product_id: String(data.tables.products?.[0]?.id ?? ""), quantity: 1 },
    ]);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/promotions", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setDashboard(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load offers");
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0),
      poll = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [load]);
  async function action(payload: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      return json.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update offer");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function change(p: Offer, operation: string) {
    if (
      operation === "delete_draft" &&
      !window.confirm(`Delete unused draft ${p.code}?`)
    )
      return;
    try {
      await action({ operation, id: p.id, expected_version: p.version });
      setNotice(
        operation === "duplicate"
          ? "Offer duplicated as an unpublished draft with a new code."
          : "Offer updated.",
      );
      await load();
    } catch {}
  }
  const offers = dashboard?.offers ?? [],
    chosen = offers.find((p) => p.id === selected),
    history = (dashboard?.redemptions ?? []).filter(
      (r) => !selected || r.promotion_id === selected,
    );
  function newOffer() {
    if (!dashboard) return;
    const start = new Date(dashboard.server_time),
      end = new Date(start.getTime() + 7 * 86400000);
    setDraft({
      name: "",
      code: "",
      discount_type: "percent",
      value: "20",
      starts: malaysiaDateTimeInput(start.toISOString()),
      ends: malaysiaDateTimeInput(end.toISOString()),
      minimum: "0",
      cap: "",
      limit: "",
      eligible_product_ids: [],
      eligible_category_ids: [],
      excluded_product_ids: [],
      excluded_category_ids: [],
      allow_manual_stacking: false,
      publication_status: "draft",
    });
    setError("");
  }
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : null));
  }
  let preview = 0;
  try {
    if (draft) {
      const base = parseAmount(draft.minimum) <= 20000 ? 20000 : 0,
        value = parseAmount(draft.value);
      preview =
        base === 0
          ? 0
          : Math.min(
              base,
              draft.discount_type === "percent"
                ? Math.floor((base * value + 5000) / 10000)
                : value,
              draft.cap ? parseAmount(draft.cap) : base,
            );
    }
  } catch {}
  return (
    <section className="promotion-management">
      <div className="toolbar">
        <div>
          <span className="eyebrow">MARKETING</span>
          <h2>Promotions</h2>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        <a className="secondary" href="/api/promotions?format=csv">
          Export CSV
        </a>
        <button
          className="primary"
          disabled={busy || !dashboard}
          onClick={newOffer}
        >
          <Plus size={16} />
          Create New Offer
        </button>
      </div>
      <p className="promotion-note">
        Guest codes need no login, membership, phone matching or OTP. One code
        per order. Times are Malaysia time (UTC+8); live validity uses the
        server clock.
      </p>
      <p className="notice">
        Published codes are available in the online storefront. Each order keeps
        its applied discount, even when you edit an offer later.
      </p>
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
      {!dashboard ? (
        <p>Loading promotion management…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Offer / code",
                    "Discount",
                    "Start (MYT)",
                    "Expiry (MYT)",
                    "Status",
                    "Redemptions (paid)",
                    "Discounts given",
                    "Associated sales",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offers.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small className="promotion-code">
                        {p.code} · v{p.version}
                      </small>
                    </td>
                    <td>{label(p)}</td>
                    <td>{date(p.starts_at)}</td>
                    <td>{date(p.ends_at)}</td>
                    <td>
                      <span className="promotion-status">{p.status}</span>
                      {p.reserved > 0 && (
                        <small className="promotion-code">
                          {p.reserved} reserved slots
                        </small>
                      )}
                    </td>
                    <td>{p.redemptions}</td>
                    <td>{money(p.total_discount_sen)}</td>
                    <td>{money(p.associated_sales_sen)}</td>
                    <td>
                      <div className="promotion-actions">
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() => {
                            setDraft(draftFor(p));
                            setError("");
                          }}
                        >
                          Edit Offer
                        </button>
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() => void change(p, "duplicate")}
                        >
                          <Copy size={13} />
                          Duplicate Offer
                        </button>
                        {p.publication_status === "draft" && (
                          <button
                            disabled={busy}
                            className="text-button"
                            onClick={() => void change(p, "publish")}
                          >
                            Publish Offer
                          </button>
                        )}
                        {p.publication_status === "published" && (
                          <button
                            disabled={busy}
                            className="text-button"
                            onClick={() => void change(p, "pause")}
                          >
                            Pause Offer
                          </button>
                        )}
                        {p.publication_status === "paused" && (
                          <button
                            disabled={busy}
                            className="text-button"
                            onClick={() => void change(p, "resume")}
                          >
                            Resume Offer
                          </button>
                        )}
                        {["published", "paused"].includes(
                          p.publication_status,
                        ) && (
                          <button
                            disabled={busy}
                            className="text-button"
                            onClick={() => void change(p, "end")}
                          >
                            End Offer
                          </button>
                        )}
                        {p.publication_status === "draft" && (
                          <button
                            disabled={busy}
                            className="text-button danger-text"
                            onClick={() => void change(p, "delete_draft")}
                          >
                            Delete Draft
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(p.id);
                            setSimCode(p.code);
                            setSimulation(null);
                          }}
                        >
                          View Promotion Performance
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {offers.length === 0 && (
            <p>No promo codes yet. Create an offer to begin.</p>
          )}
          <section className="panel">
            <div className="toolbar">
              <h3>
                {chosen
                  ? `${chosen.code} performance`
                  : "Promotion performance & redemption history"}
              </h3>
              {selected && (
                <button className="secondary" onClick={() => setSelected("")}>
                  Show all offers
                </button>
              )}
              <a
                className="secondary"
                href={`/api/promotions?format=csv${selected ? `&id=${selected}` : ""}`}
              >
                Export performance CSV
              </a>
            </div>
            {chosen && (
              <div className="promotion-metrics">
                <p>
                  Paid redemptions<strong>{chosen.redemptions}</strong>
                </p>
                <p>
                  Discounts given
                  <strong>{money(chosen.total_discount_sen)}</strong>
                </p>
                <p>
                  Gross associated sales
                  <strong>{money(chosen.associated_sales_sen)}</strong>
                </p>
                <p>
                  Net after refunds
                  <strong>{money(chosen.net_sales_sen)}</strong>
                </p>
              </div>
            )}
            <p className="promotion-note">
              Unpaid reservations are not sales. Discounts given are historical
              applied amounts. Gross associated sales include delivery/tax; net
              sales subtract recorded refunds. Refunds do not restore a used
              redemption.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Order",
                      "Code at purchase",
                      "Version",
                      "State",
                      "Discount",
                      "Date (MYT)",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id}>
                      <td>{r.order_number ?? r.order_id}</td>
                      <td>{r.code}</td>
                      <td>{r.promotion_version}</td>
                      <td>
                        {r.state === "reserved" &&
                        new Date(r.expires_at) < new Date(dashboard.server_time)
                          ? "Expired reservation"
                          : r.state}
                      </td>
                      <td>{money(r.discount_sen)}</td>
                      <td>{date(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length === 0 && (
              <p>
                No redemption history. No sample sales or redemptions are added.
              </p>
            )}
          </section>
          <section className="panel promotion-simulator">
            <h3>Admin-only promotion simulator</h3>
            <p className="promotion-note">
              Uses current server product prices and the same code engine
              planned for checkout. Simulating does not publish offers, reserve
              stock, consume a redemption or create a sale. Draft calculations
              can be previewed; future usage is not predicted.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const result = await action({
                    operation: "simulate",
                    code: simCode,
                    items: simItems,
                    preview_draft: true,
                    manual_discount_sen: parseAmount(simManual),
                    ...(simAt ? { at: malaysiaInputToUtc(simAt) } : {}),
                  });
                  setSimulation(result);
                } catch {
                  setSimulation(null);
                }
              }}
            >
              <div className="promotion-form-grid">
                <label>
                  Code to simulate
                  <input
                    value={simCode}
                    onChange={(e) => setSimCode(e.target.value.toUpperCase())}
                    required
                    maxLength={32}
                  />
                </label>
                <label>
                  Simulation time (Malaysia; blank = server now)
                  <input
                    type="datetime-local"
                    step="1"
                    value={simAt}
                    onChange={(e) => setSimAt(e.target.value)}
                  />
                </label>
                <label>
                  Other staff discount (RM)
                  <input
                    value={simManual}
                    onChange={(e) => setSimManual(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
              </div>
              {simItems.map((line, i) => (
                <div className="promotion-sim-line" key={i}>
                  <label>
                    Simulation product {i + 1}
                    <select
                      value={line.product_id}
                      onChange={(e) =>
                        setSimItems((lines) =>
                          lines.map((l, index) =>
                            index === i
                              ? { ...l, product_id: e.target.value }
                              : l,
                          ),
                        )
                      }
                    >
                      {(data.tables.products ?? [])
                        .filter((p) => !p.archived)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.english_name || p.name} ·{" "}
                            {money(p.price_sen)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Simulation quantity {i + 1}
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={line.quantity}
                      onChange={(e) =>
                        setSimItems((lines) =>
                          lines.map((l, index) =>
                            index === i
                              ? { ...l, quantity: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  {simItems.length > 1 && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setSimItems((lines) =>
                          lines.filter((_, index) => index !== i),
                        )
                      }
                    >
                      Remove simulation item {i + 1}
                    </button>
                  )}
                </div>
              ))}
              <div className="toolbar">
                <button
                  type="button"
                  className="secondary"
                  disabled={simItems.length >= 50}
                  onClick={() =>
                    setSimItems((lines) => [
                      ...lines,
                      {
                        product_id: String(data.tables.products?.[0]?.id ?? ""),
                        quantity: 1,
                      },
                    ])
                  }
                >
                  Add simulation item
                </button>
                <button className="primary" disabled={busy}>
                  Run simulation
                </button>
              </div>
            </form>
            {simulation && (
              <div className="notice" role="status">
                Simulation only · {date(simulation.at)}
                <br />
                Product subtotal: {money(simulation.product_subtotal_sen)} ·
                Discount: {money(simulation.discount_sen)} · Products after
                discount: {money(simulation.subtotal_after_discount_sen)}.
                Delivery and tax are excluded.
              </div>
            )}
          </section>
        </>
      )}
      {draft && (
        <div className="overlay">
          <section
            className="modal promotion-modal"
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "Edit Offer" : "Create New Offer"}
          >
            <div className="modal-heading">
              <h2>{draft.id ? "Edit Offer" : "Create New Offer"}</h2>
              <button
                className="icon-btn"
                aria-label="Close offer editor"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const submit = (e.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement;
                try {
                  await action({
                    operation: "save",
                    offer: {
                      ...(draft.id
                        ? {
                            id: draft.id,
                            expected_version: draft.expected_version,
                          }
                        : {}),
                      name: draft.name,
                      code: draft.code,
                      discount_type: draft.discount_type,
                      percent_bps:
                        draft.discount_type === "percent"
                          ? parseAmount(draft.value)
                          : 0,
                      fixed_discount_sen:
                        draft.discount_type === "fixed"
                          ? parseAmount(draft.value)
                          : 0,
                      starts_at: malaysiaInputToUtc(draft.starts),
                      ends_at: malaysiaInputToUtc(draft.ends),
                      minimum_spend_sen: parseAmount(draft.minimum),
                      discount_cap_sen: draft.cap
                        ? parseAmount(draft.cap)
                        : null,
                      max_redemptions: draft.limit ? Number(draft.limit) : null,
                      eligible_product_ids: draft.eligible_product_ids,
                      eligible_category_ids: draft.eligible_category_ids,
                      excluded_product_ids: draft.excluded_product_ids,
                      excluded_category_ids: draft.excluded_category_ids,
                      allow_manual_stacking: draft.allow_manual_stacking,
                      publish: submit?.value === "publish",
                    },
                  });
                  setDraft(null);
                  setNotice(
                    "Offer saved. Existing orders and redemption snapshots are unchanged.",
                  );
                  await load();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Unable to save offer",
                  );
                }
              }}
            >
              <div className="promotion-form-grid">
                <label>
                  Promotion name
                  <input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={150}
                    required
                  />
                </label>
                <label>
                  Promo code
                  <input
                    value={draft.code}
                    onChange={(e) => set("code", e.target.value.toUpperCase())}
                    minLength={3}
                    maxLength={32}
                    pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}"
                    required
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const code = await action({ operation: "generate" });
                      set("code", code);
                    } catch {}
                  }}
                >
                  <Tag size={14} />
                  Generate unique code
                </button>
                <label>
                  Discount type
                  <select
                    value={draft.discount_type}
                    onChange={(e) =>
                      set(
                        "discount_type",
                        e.target.value as "percent" | "fixed",
                      )
                    }
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed RM</option>
                  </select>
                </label>
                <label>
                  Discount value (
                  {draft.discount_type === "percent" ? "%" : "RM"})
                  <input
                    type="number"
                    min="0.01"
                    max={draft.discount_type === "percent" ? "100" : "1000000"}
                    step="0.01"
                    value={draft.value}
                    onChange={(e) => set("value", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Start date and time (Malaysia)
                  <input
                    type="datetime-local"
                    step="1"
                    value={draft.starts}
                    onChange={(e) => set("starts", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Expiry date and time (Malaysia)
                  <input
                    type="datetime-local"
                    step="1"
                    value={draft.ends}
                    onChange={(e) => set("ends", e.target.value)}
                    required
                  />
                </label>
              </div>
              <p className="notice">
                Live estimate on RM200 eligible products: −{money(preview)}. Use
                the server simulator after saving to check dates, eligibility
                and limits.
              </p>
              <details>
                <summary>Advanced settings (optional)</summary>
                <div className="promotion-form-grid">
                  <label>
                    Minimum product spending (RM)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.minimum}
                      onChange={(e) => set("minimum", e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Maximum discount cap (RM; blank = none)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={draft.cap}
                      onChange={(e) => set("cap", e.target.value)}
                    />
                  </label>
                  <label>
                    Maximum total redemptions (blank = unlimited)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.limit}
                      onChange={(e) => set("limit", e.target.value)}
                    />
                  </label>
                </div>
                <p className="promotion-note">
                  No login or customer verification is required. Per-customer
                  limits are not offered for guest checkout because identity
                  cannot be reliably established. Eligible products/categories
                  are combined; exclusions always win.
                </p>
                {(
                  [
                    ["eligible_product_ids", "Eligible products (none = all)"],
                    [
                      "eligible_category_ids",
                      "Eligible categories (none = all)",
                    ],
                    ["excluded_product_ids", "Excluded products"],
                    ["excluded_category_ids", "Excluded categories"],
                  ] as const
                ).map(([key, title]) => (
                  <fieldset className="promotion-selections" key={key}>
                    <legend>{title}</legend>
                    {(key.includes("product")
                      ? data.tables.products
                      : data.tables.product_categories
                    )?.map((p) => (
                      <label className="checkbox-label" key={p.id}>
                        <input
                          type="checkbox"
                          checked={draft[key].includes(p.id)}
                          onChange={(e) =>
                            set(
                              key,
                              e.target.checked
                                ? [...draft[key], p.id]
                                : draft[key].filter((id) => id !== p.id),
                            )
                          }
                        />
                        {key.includes("product")
                          ? `${p.sku} · ${p.english_name || p.name}`
                          : p.name}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.allow_manual_stacking}
                    onChange={(e) =>
                      set("allow_manual_stacking", e.target.checked)
                    }
                  />
                  Allow other staff discounts in simulations/future staff
                  integration
                </label>
                <p className="promotion-note">
                  Always one promo code per order. Delivery is never discounted
                  by the offer. Free-delivery thresholds use products after the
                  promotion.
                </p>
              </details>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="toolbar">
                <button
                  type="submit"
                  className="secondary"
                  value="draft"
                  disabled={busy}
                >
                  {draft.id && draft.publication_status !== "draft"
                    ? "Save updates"
                    : "Save Draft"}
                </button>
                {(!draft.id || draft.publication_status === "draft") && (
                  <button
                    type="submit"
                    value="publish"
                    className="primary"
                    disabled={busy}
                  >
                    Publish
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
