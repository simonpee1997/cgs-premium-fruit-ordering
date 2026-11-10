// Explicit one-time merchant configuration correction. Not part of normal builds.
// Does not modify orders, payments, QR settings, or schema.
import { pathToFileURL } from "node:url";
const origin = "https://xmbusapgcxtmdjvnbdgs.supabase.co";
const expected = {
  bank_name: "Maybank",
  bank_account_name: "CHIPSTI ENTERPRISE",
  bank_account_number: "512222906185",
};
export async function correctChipstiBank({
  request = fetch,
  key,
  apply = false,
}) {
  async function rest(path, method = "GET", data) {
    const response = await request(origin + "/rest/v1/" + path, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok)
      throw new Error(
        `Bank configuration request failed (${response.status}); no credential details logged`,
      );
    return response.json();
  }
  const rows = await rest(
    "online_store_settings?select=branch_id,bank_name,bank_account_name,bank_account_number",
  );
  if (rows.length !== 1)
    throw new Error("Unexpected merchant branch scope; no changes made");
  const row = rows[0];
  const branches = await rest(
    `branches?select=id,business_id&id=eq.${encodeURIComponent(row.branch_id)}`,
  );
  if (branches.length !== 1)
    throw new Error("Branch verification failed; no changes made");
  const businesses = await rest(
    `businesses?select=id,name,ssm&id=eq.${encodeURIComponent(branches[0].business_id)}`,
  );
  if (
    businesses.length !== 1 ||
    businesses[0].name !== "CHIPSTI ENTERPRISE" ||
    businesses[0].ssm !== "202603232290 (RA0139100-V)"
  )
    throw new Error("Business verification failed; no changes made");
  const correct = Object.entries(expected).every(([k, v]) => row[k] === v);
  if (!apply || correct)
    return {
      verified_business: "CHIPSTI ENTERPRISE",
      already_correct: correct,
      applied: false,
    };
  let path = `online_store_settings?branch_id=eq.${encodeURIComponent(row.branch_id)}`;
  for (const field of Object.keys(expected))
    path += `&${field}=eq.${encodeURIComponent(row[field])}`;
  const updated = await rest(path, "PATCH", expected);
  if (updated.length !== 1)
    throw new Error(
      "Concurrent settings edit detected; no bank correction applied",
    );
  const verified = await rest(
    `online_store_settings?select=bank_name,bank_account_name,bank_account_number&branch_id=eq.${encodeURIComponent(row.branch_id)}`,
  );
  if (
    verified.length !== 1 ||
    Object.entries(expected).some(([k, v]) => verified[0][k] !== v)
  )
    throw new Error("Bank correction verification failed");
  return {
    verified_business: "CHIPSTI ENTERPRISE",
    applied: true,
    stored_digits_only: true,
    changed_fields: Object.keys(expected),
    qr_unchanged: true,
    orders_unchanged: true,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const deployment = process.argv.includes("--deployment");
  // Normal/local builds are a no-op. Only an explicitly approved deployment gets this flag.
  if (deployment && !process.env.CHIPSTI_BANK_CORRECTION_SHA) process.exit(0);
  const apply = deployment || process.argv.includes("--apply");
  const sha = deployment
    ? process.env.CHIPSTI_BANK_CORRECTION_SHA
    : process.argv[process.argv.indexOf("--expected-sha") + 1];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== origin)
    throw new Error("Wrong Supabase project; no changes made");
  if (
    apply &&
    (process.env.VERCEL_ENV !== "production" ||
      !/^\w{40}$/.test(sha || "") ||
      process.env.VERCEL_GIT_COMMIT_SHA !== sha)
  )
    throw new Error(
      "Explicit production commit approval required; no changes made",
    );
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Server credential unavailable; no changes made");
  try {
    console.log(
      "CHIPSTI_BANK_CORRECTION " +
        JSON.stringify(await correctChipstiBank({ key, apply })),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
