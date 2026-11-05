import { NextResponse } from "next/server";
import { database } from "@/lib/supabase";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const rawBody = await request.text();
    if (rawBody.length > 4096)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(rawBody);
    const db = await database();
    if (body.action === "logout") {
      await db.auth.signOut();
      return NextResponse.json({ ok: true });
    }
    const { email, password } = z
      .object({ email: z.email(), password: z.string().min(8).max(200) })
      .parse(body);
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error)
      return NextResponse.json(
        { error: "Sign-in failed. Check your credentials or try again later." },
        { status: 401 },
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to sign in. Check configuration and credentials." },
      { status: 400 },
    );
  }
}
