export const money = (sen: number) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    sen / 100,
  );
export const localDate = (date: string) =>
  new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
export function discount(
  base: number,
  kind: "fixed" | "percent",
  value: number,
) {
  if (
    !Number.isSafeInteger(base) ||
    base < 0 ||
    !Number.isSafeInteger(value) ||
    value < 0
  )
    throw new Error("Invalid amount");
  if (kind === "percent" && value > 10000)
    throw new Error("Percentage exceeds 100%");
  const result =
    kind === "fixed"
      ? value
      : Number((BigInt(base) * BigInt(value) + 5000n) / 10000n);
  if (result > base) throw new Error("Discount exceeds amount");
  return result;
}
export function cashChange(total: number, tendered: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(tendered) ||
    tendered < total
  )
    throw new Error("Insufficient payment");
  return tendered - total;
}

// Convert input text exactly; database financial functions only receive integers.
export function parseAmount(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter an amount with at most two decimals");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > 100_000_000n) throw new Error("Amount exceeds limit");
  return Number(negative ? -result : result);
}
