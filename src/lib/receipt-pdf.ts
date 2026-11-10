export type ReceiptPdfOptions = { name: string; layout: "pos" | "customer" };
export function receiptPdfFilename(name: string) {
  return `CHIPSTI-${name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "receipt"}.pdf`;
}
export async function createReceiptPdf(
  element: HTMLElement,
  options: ReceiptPdfOptions,
): Promise<File> {
  if (element.querySelector("[data-pdf-loading]"))
    throw new Error(
      "Payment details are still loading. Please try again. / 付款资料正在加载，请稍后重试。",
    );
  if (element.querySelector("[data-pdf-error]"))
    throw new Error(
      "Retry loading the saved payment details before downloading. / 请先重新加载付款资料。",
    );
  await document.fonts.ready;
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map(async (img) => {
      await img.decode();
      if (!img.naturalWidth)
        throw new Error("A receipt image could not be loaded. Please retry.");
    }),
  );
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const paper =
    Number.parseFloat(
      getComputedStyle(element).getPropertyValue("--receipt-width"),
    ) || 80;
  const widthMm =
    options.layout === "pos" ? Math.min(190, Math.max(58, paper)) : 190;
  const widthPx =
    options.layout === "pos" ? Math.round((widthMm * 96) / 25.4) : 720;
  let boundaries: number[] = [];
  const canvas = await html2canvas(element, {
    scale: 3,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: 1280,
    windowHeight: 900,
    onclone: (_doc, clone) => {
      clone
        .querySelectorAll("[data-pdf-exclude]")
        .forEach((node) => node.remove());
      Object.assign(clone.style, {
        width: `${widthPx}px`,
        maxWidth: "none",
        height: "auto",
        maxHeight: "none",
        overflow: "visible",
        margin: "0",
        boxSizing: "border-box",
      });
      for (
        let parent = clone.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        parent.style.overflow = "visible";
        parent.style.maxHeight = "none";
      }
      const root = clone.getBoundingClientRect();
      boundaries = Array.from(clone.children)
        .filter(
          (node) => !(node instanceof HTMLElement) || node.offsetHeight > 0,
        )
        .map((node) =>
          Math.round(node.getBoundingClientRect().bottom - root.top),
        );
    },
  });
  // A4 pages retain the selected receipt width; split between receipt blocks so
  // item lines, totals and the complete QR/bank section stay together.
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: `CHIPSTI ${options.name}`,
    author: "CHIPSTI ENTERPRISE",
    subject: "Customer receipt",
  });
  const mmPerPixel = widthMm / canvas.width;
  const maxPixels = Math.floor(277 / mmPerPixel);
  let top = 0,
    page = 0;
  while (top < canvas.height) {
    let end = Math.min(canvas.height, top + maxPixels);
    if (end < canvas.height) {
      const candidates = boundaries
        .map((y) => Math.round((y * canvas.width) / widthPx))
        .filter((y) => y > top + maxPixels * 0.2 && y <= end);
      if (candidates.length) end = candidates[candidates.length - 1];
    }
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = end - top;
    const context = slice.getContext("2d");
    if (!context) throw new Error("PDF export is unavailable in this browser.");
    context.drawImage(
      canvas,
      0,
      top,
      canvas.width,
      end - top,
      0,
      0,
      canvas.width,
      end - top,
    );
    if (page++) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/png"),
      "PNG",
      (210 - widthMm) / 2,
      10,
      widthMm,
      slice.height * mmPerPixel,
      undefined,
      "FAST",
    );
    top = end;
  }
  return new File([pdf.output("blob")], receiptPdfFilename(options.name), {
    type: "application/pdf",
  });
}
export function downloadReceiptPdf(file: File) {
  const url = URL.createObjectURL(file),
    a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  // Keep the URL alive while mobile browsers hand the download to their viewer.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
