"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { OFFICIAL_DUITNOW_QR } from "@/lib/brand";
import "./receipt-pdf.css";
export type ReceiptBankDetails = {
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
};
export function ReceiptPaymentDetails({ bank }: { bank: ReceiptBankDetails }) {
  const hasBank = !!(
    bank.bank_name &&
    bank.bank_account_name &&
    bank.bank_account_number
  );
  return (
    <section className="receipt-payment-details" data-pdf-block>
      <h3>Payment details / 付款资料</h3>
      <Image
        src={OFFICIAL_DUITNOW_QR}
        alt="Official CHIPSTI ENTERPRISE DuitNow payment QR"
        width={760}
        height={1080}
        unoptimized
        loading="eager"
      />
      {hasBank && (
        <div className="receipt-bank-details">
          <p>
            <strong>{bank.bank_name}</strong>
          </p>
          <p>
            Account name / 户口名称
            <br />
            <strong>{bank.bank_account_name}</strong>
          </p>
          <p>
            Account number / 银行账号
            <br />
            <strong>{bank.bank_account_number}</strong>
          </p>
        </div>
      )}
      <p className="receipt-payment-note">
        For reference only. Follow the payment status above; do not pay a
        completed receipt again.
        <br />
        仅供参考。请以上方付款状态为准，已付款订单无需重复付款。
      </p>
    </section>
  );
}
export function SaleReceiptPaymentDetails({ saleId }: { saleId: string }) {
  const [bank, setBank] = useState<ReceiptBankDetails | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/receipt-payment?sale_id=${encodeURIComponent(saleId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setBank(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load payment details",
          );
      });
    return () => controller.abort();
  }, [saleId, attempt]);
  if (error)
    return (
      <div data-pdf-error className="receipt-pdf-error" role="alert">
        {error}
        <button
          data-pdf-exclude
          onClick={() => {
            setError("");
            setAttempt((n) => n + 1);
          }}
        >
          Retry / 重试
        </button>
      </div>
    );
  if (!bank)
    return <p data-pdf-loading>Loading payment details… / 正在加载付款资料…</p>;
  return <ReceiptPaymentDetails bank={bank} />;
}
