import { NextResponse } from "next/server";
import { database } from "@/lib/supabase";
import { actions, checkoutSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    if (Number(request.headers.get("content-length") || 0) > 100000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const db = await database();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const body = await request.text();
    if (body.length > 100000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const { action, payload } = JSON.parse(body);
    if (action !== "checkout" && !Object.hasOwn(actions, action))
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const schema =
      action === "checkout"
        ? checkoutSchema
        : actions[action as keyof typeof actions];
    const validated = schema.safeParse(payload);
    if (!validated.success)
      return NextResponse.json(
        {
          error: validated.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    const { data, error } =
      action === "void_sale"
        ? await db.rpc("void_sale", { payload: validated.data })
        : action === "checkout"
          ? await db.rpc("checkout", { payload: validated.data })
          : await db.rpc("retail_action", { action, payload: validated.data });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}
