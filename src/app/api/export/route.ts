import { NextResponse } from "next/server";
import writeExcelFile from "write-excel-file/node";
import { loadData } from "@/lib/data";
export async function GET(request: Request) {
  try {
    const data = await loadData();
    if (!data || data.profile.role !== "owner")
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 },
      );
    const url = new URL(request.url),
      from = url.searchParams.get("from") ?? "",
      to = url.searchParams.get("to") ?? "";
    const sheet: (string | number)[][] = [];
    sheet.push(["CHIPSTI ENTERPRISE", "SSM: 202603232290 (RA0139100-V)"]);
    sheet.push([
      "Receipt",
      "Malaysia date",
      "Subtotal (sen)",
      "Discount (sen)",
      "Tax (sen)",
      "Total (sen)",
      "Cashier",
    ]);
    for (const sale of data.tables.sales) {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
      }).format(new Date(sale.created_at));
      if ((from && date < from) || (to && date > to)) continue;
      sheet.push([
        sale.receipt_number,
        new Intl.DateTimeFormat("en-MY", {
          timeZone: "Asia/Kuala_Lumpur",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(sale.created_at)),
        sale.subtotal_sen,
        sale.discount_sen,
        sale.tax_sen,
        sale.total_sen,
        sale.cashier_name,
      ]);
    }
    const refunds: (string | number)[][] = [];
    refunds.push([
      "Sale ID",
      "Date",
      "Refund (sen)",
      "Tax reversed (sen)",
      "Method",
      "Reason",
    ]);
    for (const r of data.tables.refunds) {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
      }).format(new Date(r.created_at));
      if ((from && date < from) || (to && date > to)) continue;
      refunds.push([
        r.sale_id,
        r.created_at,
        r.total_sen,
        r.tax_sen,
        r.method,
        r.reason,
      ]);
    }
    const buffer = await writeExcelFile([
      { data: sheet, sheet: "Sales" },
      { data: refunds, sheet: "Refunds" },
    ]).toBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="chipsti-sales.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Export failed. Verify database connectivity." },
      { status: 500 },
    );
  }
}
