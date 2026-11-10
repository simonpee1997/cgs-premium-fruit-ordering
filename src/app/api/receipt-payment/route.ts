import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/supabase";
import { shopService } from "@/lib/shop-server";

// Cashiers cannot browse store settings. Authorize a visible sale before returning
// only its branch's customer-facing payment details; never widen settings RLS.
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const reply = (body: object, status = 200) =>
    NextResponse.json(body, { status, headers });
  const id = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("sale_id"));
  if (!id.success) return reply({ error: "Receipt not found" }, 404);
  try {
    const db = await database();
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();
    if (authError || !user)
      return reply({ error: "Sign in to view this receipt" }, 401);
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("branch_id,role,active")
      .eq("id", user.id)
      .single();
    if (
      profileError ||
      !profile?.active ||
      !["owner", "manager", "cashier"].includes(profile.role)
    )
      return reply({ error: "Receipt access denied" }, 403);
    const { data: sale, error: saleError } = await db
      .from("sales")
      .select("id,branch_id")
      .eq("id", id.data)
      .eq("branch_id", profile.branch_id)
      .maybeSingle();
    if (saleError || !sale) return reply({ error: "Receipt not found" }, 404);
    const { data: setting, error } = await shopService()
      .from("online_store_settings")
      .select("bank_name,bank_account_name,bank_account_number")
      .eq("branch_id", sale.branch_id)
      .maybeSingle();
    if (error) throw error;
    return reply(
      setting ?? {
        bank_name: "",
        bank_account_name: "",
        bank_account_number: "",
      },
    );
  } catch {
    return reply(
      { error: "Could not load saved payment details. Please retry." },
      503,
    );
  }
}
