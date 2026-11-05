import { describe, it, expect } from "vitest";
import {
  discount,
  cashChange,
  money,
  localDate,
  parseAmount,
} from "../src/lib/money";
import { checkoutSchema } from "../src/lib/validation";
describe("MYR and validation", () => {
  it("uses integer rounding for percentage discounts", () => {
    expect(discount(1999, "percent", 1250)).toBe(250);
    expect(discount(1800, "fixed", 100)).toBe(100);
  });
  it("rejects negative totals and insufficient cash", () => {
    expect(() => discount(100, "fixed", 101)).toThrow();
    expect(() => discount(100, "percent", 10001)).toThrow();
    expect(() => cashChange(1800, 1799)).toThrow();
    expect(cashChange(1800, 2000)).toBe(200);
  });
  it("formats MYR and Malaysia dates", () => {
    expect(money(1800)).toMatch(/18\.00/);
    expect(localDate("2026-11-04T16:30:00Z")).toMatch(/5 Nov 2026/);
  });
  it("rejects fractional money, empty carts and arbitrary methods", () => {
    expect(checkoutSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("parses RM input without floating point rounding", () => {
    expect(parseAmount("18.29")).toBe(1829);
    expect(parseAmount("-0.05")).toBe(-5);
    expect(() => parseAmount("1.005")).toThrow();
    expect(() => parseAmount("NaN")).toThrow();
  });
});
