"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/money";
export type PosPromotionQuote = {
  context: string;
  code: string;
  discount_sen: number;
  error?: string;
};
export default function PosPromotionCode({
  code,
  context,
  items,
  blocked,
  quote,
  onCode,
  onQuote,
}: {
  code: string;
  context: string;
  items: { product_id: string; quantity: number }[];
  blocked: boolean;
  quote: PosPromotionQuote | null;
  onCode: (code: string) => void;
  onQuote: (quote: PosPromotionQuote) => void;
}) {
  const [input, setInput] = useState("");
  const basket = JSON.stringify(items);
  useEffect(() => {
    if (!code) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        if (blocked)
          throw new Error(
            "Remove other promotions and manual discounts before using a code.",
          );
        const r = await fetch("/api/pos/promotion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, items: JSON.parse(basket) }),
          signal: abort.signal,
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Code unavailable");
        if (!abort.signal.aborted)
          onQuote({ context, code, discount_sen: j.discount_sen });
      } catch (e) {
        if (!abort.signal.aborted)
          onQuote({
            context,
            code,
            discount_sen: 0,
            error: e instanceof Error ? e.message : "Code unavailable",
          });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [code, context, basket, blocked, onQuote]);
  const current = quote?.context === context && quote.code === code;
  return (
    <div className="pos-code">
      <label htmlFor="pos-promo-code">Promo code / 优惠码</label>
      <div className="toolbar">
        <input
          id="pos-promo-code"
          placeholder="Enter promo code"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={32}
        />
        <button
          className="secondary"
          type="button"
          disabled={!input.trim() || !items.length}
          onClick={() => onCode(input.trim().toUpperCase())}
        >
          Apply
        </button>
      </div>
      {code && (
        <>
          <button
            className="link-btn"
            type="button"
            onClick={() => {
              onCode("");
              setInput("");
            }}
          >
            Remove {code}
          </button>
          <p role={current && quote?.error ? "alert" : "status"}>
            {!current
              ? "Checking promo code…"
              : quote?.error || `${code}: −${money(quote!.discount_sen)}`}
          </p>
        </>
      )}
    </div>
  );
}
