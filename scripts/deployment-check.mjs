// Fail Vercel builds that would otherwise publish an unconfigured setup screen.
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
const failures = [];
for (const name of required) {
  if (!process.env[name]) failures.push(`${name} is missing`);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      /YOUR|PROJECT-REF|fixture|example|localhost/i.test(parsed.hostname)
    ) {
      failures.push("Supabase URL must be the real HTTPS project origin");
    }
  } catch {
    failures.push("Supabase URL is invalid");
  }
}
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (key) {
  if (key.startsWith("sb_secret_"))
    failures.push(
      "A secret Supabase key must never be exposed as a public variable",
    );
  else if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (payload.role !== "anon")
        failures.push("A legacy public key must have the anon role");
    } catch {
      failures.push("Legacy Supabase public key is malformed");
    }
  } else if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key))
    failures.push("Use a real Supabase publishable key or legacy anon key");
}
if (failures.length) {
  console.error(
    "Deployment configuration is incomplete:\n" +
      failures.map((f) => `- ${f}`).join("\n"),
  );
  process.exit(1);
}
console.log(
  "Public deployment configuration passed. Hosted authentication and database acceptance checks are still required.",
);
