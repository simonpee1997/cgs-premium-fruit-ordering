import { database } from "./supabase";
export async function loadData() {
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error || !profile?.active)
    throw new Error(
      "Your account has no active staff profile. Ask the owner to provision access.",
    );
  const tables = [
    "products",
    "product_categories",
    "inventory",
    "customers",
    "sales",
    "sale_items",
    "payments",
    "refunds",
    "refund_items",
    "sale_voids",
    "cashier_sessions",
    "held_orders",
    "system_settings",
    "promotions",
    ...(profile.role !== "cashier"
      ? [
          "stock_movements",
          "suppliers",
          "purchase_orders",
          "purchase_order_items",
          "cash_movements",
          "online_orders",
          "online_order_items",
          "online_order_events",
          "online_store_settings",
        ]
      : []),
    ...(profile.role === "owner"
      ? ["product_costs", "sale_item_costs", "profiles", "audit_logs"]
      : []),
  ];
  const pairs = await Promise.all(
    tables.map(async (table) => {
      const records = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await db
          .from(table)
          .select("*")
          .order(
            table === "inventory"
              ? "product_id"
              : table === "product_costs"
                ? "product_id"
                : table === "sale_item_costs"
                  ? "sale_item_id"
                  : table === "system_settings"
                    ? "branch_id"
                    : "id",
          )
          .range(start, start + 499);
        if (error) throw new Error(`${table}: ${error.message}`);
        records.push(...data);
        if (data.length < 500) break;
      }
      return [table, records] as const;
    }),
  );
  const tablesData = Object.fromEntries(pairs);
  const availability = await db.rpc("stock_availability");
  if (availability.error)
    throw new Error(
      "Stock availability could not be loaded. Confirm the online-shop migration has been applied.",
    );
  tablesData.inventory = (tablesData.inventory ?? []).map((row) => ({
    ...row,
    ...availability.data?.find(
      (s: { product_id: string }) => s.product_id === row.product_id,
    ),
  }));
  return { profile, tables: tablesData };
}
export type AppData = NonNullable<Awaited<ReturnType<typeof loadData>>>;
