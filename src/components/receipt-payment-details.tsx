"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { OFFICIAL_DUITNOW_QR } from "@/lib/brand";
import {
  type BankDetails,
  receiptBankDetails,
  formatBankAccountNumber,
} from "@/lib/bank-details";
import "./receipt-pdf.css";
export type ReceiptBankDetails = BankDetails;
export function BankAccountDetails({ bank }: { bank: ReceiptBankDetails }) {
  const details = receiptBankDetails(bank);
  const [message, setMessage] = useState("");
  if (
    !details.bank_name ||
    !details.bank_account_name ||
    !details.bank_account_number
  )
    return null;
  return (
    <div className="receipt-bank-details">
      <p>
        <strong data-bank-field="bank">{details.bank_name}</strong>
      </p>
      <p>
        Account name / 户口名称
        <br />
        <strong data-bank-field="name">{details.bank_account_name}</strong>
      </p>
      <p>
        Account number / 银行账号
        <br />
        <strong className="receipt-account-number" data-bank-field="number">
          {formatBankAccountNumber(details.bank_account_number)}
        </strong>
      </p>
      <button
        type="button"
        data-pdf-exclude
        className="receipt-copy-account"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(details.bank_account_number);
            setMessage("Account number copied / 银行账号已复制");
          } catch {
            setMessage(
              "Select and copy the account number above. / 请选择并复制上方银行账号。",
            );
          }
        }}
      >
        Copy account number / 复制银行账号
      </button>
      {message && (
        <p role="status" data-pdf-exclude>
          {message}
        </p>
      )}
    </div>
  );
}
export function ReceiptPaymentDetails({ bank }: { bank: ReceiptBankDetails }) {
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
      <BankAccountDetails bank={bank} />
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
