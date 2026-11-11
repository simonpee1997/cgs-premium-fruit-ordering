"use client";
import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import type { ReceiptPdfOptions } from "@/lib/receipt-pdf";
import "./receipt-pdf.css";
export default function ReceiptPdfActions({
  getReceipt,
  name,
  layout,
  whatsappUrl,
  shareText,
}: {
  getReceipt: () => HTMLElement | null;
  whatsappUrl?: string | null;
  shareText?: string;
} & ReceiptPdfOptions) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  // Sharing a pre-generated File preserves the user activation required on phones.
  const [file, setFile] = useState<File | null>(null);
  async function download() {
    const receipt = getReceipt();
    if (!receipt) return;
    setBusy(true);
    setMessage("");
    setFile(null);
    try {
      const { createReceiptPdf, downloadReceiptPdf } =
        await import("@/lib/receipt-pdf");
      const result = await createReceiptPdf(receipt, { name, layout });
      downloadReceiptPdf(result);
      setFile(result);
      setMessage(
        "PDF ready. You can attach it in WhatsApp or another app. / PDF 已生成，可通过 WhatsApp 或其他应用发送。",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Unable to download PDF. Please retry. / 无法下载 PDF，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!file) return;
    try {
      const data: ShareData = { files: [file], title: `CHIPSTI ${name}` };
      if (shareText && navigator.canShare?.({ ...data, text: shareText }))
        data.text = shareText;
      await navigator.share(data);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setMessage(
          "Attach the downloaded PDF in your preferred app. / 请在应用中附加已下载的 PDF。",
        );
    }
  }
  return (
    <div className="receipt-pdf-actions" data-pdf-exclude>
      <button
        type="button"
        className="secondary shop-secondary"
        onClick={() => void download()}
        disabled={busy}
      >
        <Download size={16} />
        {busy ? "Preparing PDF… / 正在生成 PDF…" : "Download PDF / 下载 PDF"}
      </button>
      {file &&
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] }) && (
          <button
            type="button"
            className="secondary shop-secondary"
            onClick={() => void share()}
          >
            <Share2 size={16} />
            Share PDF / 分享 PDF
          </button>
        )}
      {whatsappUrl && (
        <>
          <a
            className="secondary shop-secondary"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open store WhatsApp / 打开商家 WhatsApp
          </a>
          <p>
            To send the PDF, download it and attach it in the store chat, or tap
            Share PDF and choose WhatsApp and the store contact. /
            下载后在商家聊天中附加 PDF，或点击分享 PDF 并选择 WhatsApp
            和商家联系人。
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
