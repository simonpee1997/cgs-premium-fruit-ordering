import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/supabase";
import { readShopBody } from "@/lib/shop-server";
import { promotionAdminSchema } from "@/lib/promotion-validation";
import { csvCell, type PromotionDashboard } from "@/lib/promotions";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
export async function GET(request: Request) {
  try {
    const db = await database();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401, headers },
      );
    const { data, error } = await db.rpc("promotion_dashboard");
    if (error)
      return NextResponse.json(
        { error: "Owner access and promotion migration 008 are required" },
        { status: 403, headers },
      );
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id && !z.uuid().safeParse(id).success)
      return NextResponse.json(
        { error: "Invalid offer" },
        { status: 400, headers },
      );
    const dashboard = data as PromotionDashboard;
    if (url.searchParams.get("format") === "csv") {
      const rows: unknown[][] = [
        [
          "Record",
          "Promotion",
          "Code",
          "Status",
          "Starts (UTC)",
          "Ends (UTC)",
          "Redemptions (paid)",
          "Discount (sen)",
          "Gross associated sales (sen)",
          "Net associated sales (sen)",
          "Order",
          "Sale ID",
          "Version",
        ],
      ];
      for (const p of dashboard.offers.filter((p) => !id || p.id === id))
        rows.push([
          "Promotion",
          p.name,
          p.code,
          p.status,
          p.starts_at,
          p.ends_at,
          p.redemptions,
          p.total_discount_sen,
          p.associated_sales_sen,
          p.net_sales_sen,
          "",
          "",
          p.version,
        ]);
      for (const r of dashboard.redemptions.filter(
        (r) => !id || r.promotion_id === id,
      ))
        rows.push([
          "Redemption",
          r.promotion_name,
          r.code,
          r.state,
          "",
          "",
          "",
          r.discount_sen,
          r.sale_total_sen,
          r.sale_total_sen - r.refund_sen,
          r.order_number,
          r.sale_id,
          r.promotion_version,
        ]);
      return new Response(
        "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
        {
          headers: {
            ...headers,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              "attachment; filename=chipsti-promotion-performance.csv",
          },
        },
      );
    }
    return NextResponse.json(dashboard, { headers });
  } catch {
    return NextResponse.json(
      { error: "Unable to load promotion management" },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  try {
    const body = await readShopBody(request),
      parsed = promotionAdminSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400, headers },
      );
    const db = await database();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401, headers },
      );
    const { operation, ...rest } = parsed.data;
    const result =
      operation === "generate"
        ? await db.rpc("promotion_generate_code")
        : operation === "simulate"
          ? await db.rpc("promotion_simulate", { payload: rest })
          : await db.rpc("manage_promotion", {
              operation,
              payload:
                operation === "save"
                  ? (rest as { offer: unknown }).offer
                  : rest,
            });
    if (result.error)
      return NextResponse.json(
        {
          error:
            result.error.code === "23505"
              ? "That promo code already exists. Choose another code."
              : result.error.message,
        },
        {
          status:
            result.error.code === "23505" ||
            /changed.*Refresh/.test(result.error.message)
              ? 409
              : 400,
          headers,
        },
      );
    return NextResponse.json({ result: result.data }, { headers });
  } catch (e) {
    const origin = e instanceof Error && e.message === "Invalid origin";
    return NextResponse.json(
      { error: origin ? "Invalid origin" : "Unable to save promotion" },
      { status: origin ? 403 : 400, headers },
    );
  }
}
